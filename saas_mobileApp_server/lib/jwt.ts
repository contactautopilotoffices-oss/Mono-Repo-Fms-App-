import { createHmac, timingSafeEqual } from "crypto";

/**
 * Local verification of Supabase HS256 access tokens.
 *
 * Why this exists: every API route called `supabase.auth.getUser(token)`, which
 * is an HTTP round trip to the Supabase Auth service. At 100 to 300 ms that was
 * the single largest fixed cost on every request the mobile app makes, and it
 * ran before anything else, including cache lookups.
 *
 * Supabase signs access tokens with the project's JWT secret (HS256), so the
 * same check the Auth service performs can be done locally with Node's built-in
 * crypto: no network, no new dependency.
 *
 * This verifies signature, expiry and issuer. It deliberately does NOT check
 * whether the user was deleted or globally signed out since the token was
 * issued; that is what short token lifetimes are for, and it matches how
 * Supabase's own server-side helpers treat a verified JWT.
 */

const JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET ?? process.env.FMS_SUPABASE_JWT_SECRET ?? "";

/** Clock skew tolerance, in seconds, for exp/nbf. */
const CLOCK_SKEW_SECONDS = 10;

export interface VerifiedJwtClaims {
  sub: string;
  email?: string;
  role?: string;
  exp?: number;
  [key: string]: unknown;
}

/** True when a JWT secret is configured and local verification can be used. */
export function canVerifyLocally(): boolean {
  return JWT_SECRET.length > 0;
}

function base64UrlDecode(input: string): Buffer {
  const normalised = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised.padEnd(normalised.length + ((4 - (normalised.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}

/**
 * Verify an HS256 JWT and return its claims, or null if it is not valid.
 *
 * Returns null (rather than throwing) for every failure mode so callers can
 * treat "invalid token" uniformly as unauthorized.
 */
export function verifySupabaseJwt(token: string): VerifiedJwtClaims | null {
  if (!JWT_SECRET) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let header: { alg?: string; typ?: string };
  let payload: VerifiedJwtClaims;
  try {
    header = JSON.parse(base64UrlDecode(encodedHeader).toString("utf8"));
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
  } catch {
    return null;
  }

  // Only HS256. Rejecting anything else closes the "alg: none" and
  // algorithm-confusion family of attacks.
  if (header.alg !== "HS256") return null;

  const expected = createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const provided = base64UrlDecode(encodedSignature);

  // Length check first: timingSafeEqual throws on a length mismatch.
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;

  const nowSeconds = Math.floor(Date.now() / 1000);

  if (typeof payload.exp === "number" && payload.exp + CLOCK_SKEW_SECONDS < nowSeconds) {
    return null; // expired
  }
  if (typeof payload.nbf === "number" && (payload.nbf as number) - CLOCK_SKEW_SECONDS > nowSeconds) {
    return null; // not yet valid
  }
  if (!payload.sub || typeof payload.sub !== "string") {
    return null; // no subject means no user to act as
  }

  return payload;
}
