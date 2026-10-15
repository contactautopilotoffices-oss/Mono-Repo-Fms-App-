/**
 * Prefetch Service — Critical Screen Data Loader
 *
 * SOURCE OF TRUTH: React Query
 *
 * Provides fetchers that warm React Query cache on login,
 * so dashboard/tickets appear instantly without network delay.
 *
 * This service writes ONLY to React Query cache.
 * UI state should use Zustand only for ephemeral state.
 *
 * Tier 1 (Critical — prefetched immediately on login):
 *   - Full dashboard data (via useDashboardQuery's fetchDashboardData)
 *
 * Tier 2 (Important — prefetched after UI settles):
 *   - Checklist, Diesel, Electricity, Users, Stock
 */

import { serverApi } from '@/lib/serverApi';
import { queryClient } from '@/utils/queryClient';
import { queryKeys } from '@/utils/queryKeys';
import { fetchDashboardData, type DashboardData } from '@/hooks/useDashboardQuery';

// ---------------------------------------------------------------------------
// Helper: Check if error is an access-denied error
// ---------------------------------------------------------------------------

function isAccessDeniedError(error: any): boolean {
  if (!error) return false;
  const msg = error?.message || '';
  return msg.includes('403') || msg.includes('Access Denied') || msg.includes('Forbidden');
}

// ---------------------------------------------------------------------------
// Dashboard Prefetch (uses unified fetchDashboardData)
// ---------------------------------------------------------------------------

/**
 * Prefetch full dashboard data into React Query cache.
 * This replaces individual fetchers and writes directly to RQ.
 * Handles 403 errors gracefully - some users may not have access to all properties.
 */
// Roles whose dashboard screen renders the property-admin dashboard, mirroring
// app/property/[propertyId]/dashboard/index.tsx. Everyone else (tenant, staff,
// MST, security, vendor) never reads the prefetched data.
const ORG_ADMIN_ROLES = ['org_super_admin', 'org_admin', 'owner'];
const PROPERTY_ADMIN_ROLES = ['property_admin', 'admin', 'manager', 'property_manager', 'facility_manager', 'spoc', 'administrator'];
const MST_ROLES = ['master_admin', 'mst', 'super_admin'];

export function usesPropertyAdminDashboard(
  membership: { org_role?: string | null; properties?: { id: string; role?: string | null }[] } | null | undefined,
  propertyId: string
): boolean {
  if (!membership) return false;
  const orgRole = (membership.org_role || '').toLowerCase();
  if (MST_ROLES.includes(orgRole)) return false;
  if (ORG_ADMIN_ROLES.includes(orgRole)) return true;
  const propRole = (membership.properties?.find((p) => p.id === propertyId)?.role || '').toLowerCase();
  if (MST_ROLES.includes(propRole)) return false;
  return ORG_ADMIN_ROLES.includes(propRole) || PROPERTY_ADMIN_ROLES.includes(propRole);
}

export async function prefetchDashboard(propertyId: string): Promise<void> {
  if (!propertyId || propertyId === 'all') return;

  console.log('[prefetchService] Prefetching dashboard for:', propertyId);

  try {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.property.dashboard(propertyId),
      queryFn: () => fetchDashboardData(propertyId),
      staleTime: 5 * 60 * 1000,
    });
    console.log('[prefetchService] Dashboard prefetch complete');
  } catch (error: any) {
    if (isAccessDeniedError(error)) {
      console.log('[prefetchService] Skipping dashboard prefetch - no access to property');
    } else {
      console.error('[prefetchService] Dashboard prefetch error:', error);
    }
  }
}

// ---------------------------------------------------------------------------
// Critical Prefetch (runs on login)
// ---------------------------------------------------------------------------

export async function prefetchCriticalOnLogin(
  propertyId: string,
  _options?: { signal?: AbortSignal }
): Promise<void> {
  if (!propertyId || propertyId === 'all') return;

  // Short delay to let the Supabase session token settle after sign-in. Was
  // 1500ms, which simply postponed the dashboard prefetch by a second and a half
  // on every login. serverApi now force-refreshes the token and retries once on a
  // 401, so a token that is not quite ready self-heals instead of needing to be
  // waited out.
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Prefetch dashboard data - this is the main critical prefetch
  await prefetchDashboard(propertyId);

  // NOTE: a tickets prefetch used to live here. It was dead code in two ways:
  // it wrote a bare array while the list screen caches
  // `{ tickets, hasMore }`, and it hardcoded the query key
  // `['tickets', propertyId, 'all', 'all', 'false', '20']`, which never matched
  // the key the screen actually registers (that key also carries the category,
  // raisedBy, assignedTo, sort and search filters). So it spent a request on
  // every login and populated an entry nothing ever read. The dashboard prefetch
  // above already warms what the first screen needs.
}

// ---------------------------------------------------------------------------
// Important Prefetch (runs after UI settles)
// ---------------------------------------------------------------------------

export async function prefetchImportantOnLogin(propertyId: string): Promise<void> {
  if (!propertyId || propertyId === 'all') return;

  await Promise.allSettled([
    // A tickets-list prefetch used to be here. Its key ended in
    // ['all', 'all', 'false', '50'] while the tickets screen registers an
    // 11-part key, so nothing ever read it: one heavy 6-join request wasted on
    // every cold start (the same dead prefetch already removed from the login path).
    // Checklist
    queryClient.prefetchQuery({
      queryKey: queryKeys.property.checklist(propertyId),
      queryFn: async () => {
        const res = await serverApi.get('/api/checklist', { propertyId });
        return res;
      },
      staleTime: 5 * 60 * 1000,
    }),
    // Diesel
    queryClient.prefetchQuery({
      queryKey: queryKeys.property.diesel(propertyId),
      queryFn: async () => {
        const res = await serverApi.query({
          table: 'generators',
          action: 'select',
          filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
        });
        return res;
      },
      staleTime: 5 * 60 * 1000,
    }),
    // Electricity
    queryClient.prefetchQuery({
      queryKey: queryKeys.property.electricity(propertyId),
      queryFn: async () => {
        const res = await serverApi.query({
          table: 'electricity_readings',
          action: 'select',
          filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
          limit: 100,
        });
        return res;
      },
      staleTime: 5 * 60 * 1000,
    }),
    // Users
    queryClient.prefetchQuery({
      queryKey: queryKeys.property.users(propertyId),
      queryFn: async () => {
        const res = await serverApi.query({
          table: 'property_memberships',
          action: 'select',
          select: 'role, users!user_id(id,full_name,user_photo_url)',
          filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
        });
        return res;
      },
      staleTime: 5 * 60 * 1000,
    }),
    // Stock
    queryClient.prefetchQuery({
      queryKey: queryKeys.property.stock(propertyId),
      queryFn: async () => {
        const res = await serverApi.query({
          table: 'stock_items',
          action: 'select',
          filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
          limit: 100,
        });
        return res;
      },
      staleTime: 5 * 60 * 1000,
    }),
  ]);
}