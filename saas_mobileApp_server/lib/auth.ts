import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySupabaseJwt, canVerifyLocally } from "@/lib/jwt";
import { getCache, setCache, deleteCache } from "@/lib/cache";

export interface AuthenticatedUser {
  id: string;
  email?: string;
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export async function getAuthenticatedUser(request: NextRequest): Promise<{
  token: string | null;
  user: AuthenticatedUser | null;
  response?: NextResponse;
}> {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) {
    return {
      token: null,
      user: null,
      response: NextResponse.json({ error: "Missing bearer token" }, { status: 401 })
    };
  }

  // Fast path: verify the JWT signature locally. This replaces a 100 to 300 ms
  // HTTP round trip to Supabase Auth that previously ran on EVERY request to
  // every route, before any cache lookup.
  //
  // On anything it cannot verify it falls THROUGH to the network check rather
  // than rejecting. That matters: Supabase projects using asymmetric signing keys
  // (ES256/RS256) issue tokens this HS256 path cannot validate, and a hard reject
  // there would 401 every single request. Falling through means the worst case is
  // the old behaviour (one extra round trip), never a lockout. Security is
  // unchanged because a forged token fails both checks.
  if (canVerifyLocally()) {
    const claims = verifySupabaseJwt(token);
    if (claims) {
      return {
        token,
        user: {
          id: claims.sub,
          email: typeof claims.email === "string" ? claims.email : undefined
        }
      };
    }
  }

  // Authoritative check: used when no JWT secret is configured, when the token is
  // not HS256, or when local verification rejected it.
  const supabase = createAnonClient(token);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return {
      token,
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    };
  }

  return {
    token,
    user: {
      id: data.user.id,
      email: data.user.email
    }
  };
}

// ── Role Constants (aligned with app_role enum + saas_one web app) ─────────
// NOTE: The DB enum app_role only contains: master_admin, org_super_admin,
// property_admin, staff, tenant, food_vendor, mst, security, vendor,
// soft_service_staff, soft_service_supervisor, soft_service_manager,
// super_tenant, maintenance_vendor, procurement.
// The web app TypeScript types also reference org_admin / owner, but these
// do NOT exist in the current DB enum.

/** Org-level admin roles that have access to ALL properties in the org */
const ORG_ADMIN_ROLES = new Set(["org_super_admin", "org_admin", "owner"]);

/** Property-level roles that grant scoped access to a specific property */
const PROPERTY_ROLES = new Set([
  "property_admin", "staff", "mst", "tenant", "security",
  "soft_service_manager", "soft_service_staff", "soft_service_supervisor",
  "food_vendor", "vendor", "maintenance_vendor", "procurement"
]);

/** MST roles - can be stored in either org_memberships or property_memberships */
const MST_ROLES = ['mst', 'master_admin', 'super_admin'];

// ── Property Access (read gate) ────────────────────────────────────────────
// Mirrors saas_one web app property-access logic + super_tenant portfolio check.
// Any user that can READ property data passes this gate.

export type PropertyAccess =
  | { authorized: true; role: string }
  | { authorized: false; role?: undefined };

/** How long a property-access decision is trusted in Redis. */
const ACCESS_CACHE_TTL_SECONDS = 5 * 60;

/**
 * In-process fallback TTL, in ms.
 *
 * Deliberately much shorter than the Redis TTL: an in-memory entry cannot be
 * invalidated from another instance, so the window in which a revoked membership
 * still passes must stay small. This exists so the saved DB round trips do not
 * depend on Redis being configured.
 */
const ACCESS_MEMO_TTL_MS = 60 * 1000;

/** Bound the map so a long-lived instance cannot grow it without limit. */
const ACCESS_MEMO_MAX_ENTRIES = 500;

const accessMemo = new Map<string, { role: string; at: number }>();

function accessCacheKey(userId: string, propertyId: string): string {
  return `access:${userId}:${propertyId}`;
}

function readMemo(key: string): string | null {
  const hit = accessMemo.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ACCESS_MEMO_TTL_MS) {
    accessMemo.delete(key);
    return null;
  }
  return hit.role;
}

function writeMemo(key: string, role: string): void {
  if (accessMemo.size >= ACCESS_MEMO_MAX_ENTRIES) {
    // Evict the oldest insertion; Map preserves insertion order.
    const oldest = accessMemo.keys().next().value;
    if (oldest !== undefined) accessMemo.delete(oldest);
  }
  accessMemo.set(key, { role, at: Date.now() });
}

/**
 * Drop a cached access decision.
 *
 * Call this whenever a membership changes (added, removed, role changed, or
 * deactivated) so a revoked user stops passing the gate before the TTL lapses.
 */
export async function invalidatePropertyAccess(userId: string, propertyId: string): Promise<void> {
  const key = accessCacheKey(userId, propertyId);
  accessMemo.delete(key);
  await deleteCache(key);
}

/**
 * Property access gate, cached.
 *
 * The underlying resolver runs 2 to 4 sequential DB queries, and it ran on every
 * single request to every property-scoped route, including requests that then
 * hit a Redis cache and did no other DB work at all. Caching the decision for a
 * few minutes removes that fixed cost from the hot path.
 *
 * Only positive decisions are cached. A denial is cheap to recompute and must
 * not be sticky: a user who has just been granted access should not be locked
 * out for the rest of the TTL.
 */
export async function getPropertyAccess(
  userId: string,
  propertyId: string
): Promise<PropertyAccess> {
  const key = accessCacheKey(userId, propertyId);

  // 1. In-process memo: no network at all.
  const memoRole = readMemo(key);
  if (memoRole) return { authorized: true, role: memoRole };

  // 2. Redis, when configured (shared across instances).
  const cached = await getCache<{ role: string }>(key);
  if (cached?.role) {
    writeMemo(key, cached.role);
    return { authorized: true, role: cached.role };
  }

  // 3. The real thing: 2 to 4 sequential DB queries.
  const result = await resolvePropertyAccess(userId, propertyId);

  if (result.authorized && result.role) {
    writeMemo(key, result.role);
    await setCache(key, { role: result.role }, ACCESS_CACHE_TTL_SECONDS);
  }

  return result;
}

async function resolvePropertyAccess(userId: string, propertyId: string): Promise<PropertyAccess> {
  const admin = createAdminClient();

  // 1. Master admin bypass
  const { data: userProfile } = await admin
    .from("users")
    .select("is_master_admin")
    .eq("id", userId)
    .maybeSingle();

  if (userProfile?.is_master_admin) {
    return { authorized: true, role: "master_admin" };
  }

  // 2. Get property's organization
  const { data: property, error: pError } = await admin
    .from("properties")
    .select("organization_id")
    .eq("id", propertyId)
    .maybeSingle();

  if (pError) console.error(`[getPropertyAccess] Property error:`, pError);

  // 3. Check property-level membership FIRST (MST may store role here)
  const { data: propertyMembership, error: pmError } = await admin
    .from("property_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("property_id", propertyId)
    .or("is_active.eq.true,is_active.is.null")
    .maybeSingle();

  if (pmError) console.error(`[getPropertyAccess] Property membership error:`, pmError);

  if (propertyMembership) {
    // MST users from property_memberships get access
    if (MST_ROLES.includes(propertyMembership.role)) {
      return { authorized: true, role: propertyMembership.role };
    }
    // All other property-level roles get access
    return { authorized: true, role: propertyMembership.role };
  }

  // 4. If no property membership, check org-level membership
  if (property?.organization_id) {
    const { data: orgMembership, error: omError } = await admin
      .from("organization_memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("organization_id", property.organization_id)
      .or("is_active.eq.true,is_active.is.null")
      .maybeSingle();

    if (omError) console.error(`[getPropertyAccess] Org membership error:`, omError);

    if (orgMembership) {
      // MST users get access to ALL properties in the org
      if (MST_ROLES.includes(orgMembership.role)) {
        return { authorized: true, role: orgMembership.role };
      }

      // Org admins get access to ALL properties in the org
      if (ORG_ADMIN_ROLES.has(orgMembership.role)) {
        return { authorized: true, role: orgMembership.role };
      }

      // Super tenant: must have property in their portfolio
      if (orgMembership.role === "super_tenant") {
        const { data: stProp } = await admin
          .from("super_tenant_properties")
          .select("id")
          .eq("user_id", userId)
          .eq("property_id", propertyId)
          .eq("organization_id", property.organization_id)
          .maybeSingle();

        if (stProp) {
          return { authorized: true, role: "super_tenant" };
        }
      }

      // Any active org member can read property-scoped data
      return { authorized: true, role: orgMembership.role };
    }
  }

  return { authorized: false as const };
}
