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

  // Small delay to let the Supabase session token fully propagate after sign-in.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Prefetch dashboard data - this is the main critical prefetch
  await prefetchDashboard(propertyId);

  // Also prefetch tickets with the EXACT query key the ticket page uses
  try {
    await queryClient.prefetchQuery({
      queryKey: ['tickets', propertyId, 'all', 'all', 'false', '20'],
      queryFn: async () => {
        const { data } = await serverApi.query({
          table: 'tickets',
          action: 'select',
          select: `id, title, description, status, priority, ticket_number, created_at,
                   property_id, organization_id, photo_before_url, internal, raised_by, assigned_to,
                   assignee:users!assigned_to(id, full_name, user_photo_url),
                   creator:users!raised_by(id, full_name)`,
          filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
          orders: [{ column: 'created_at', ascending: false }],
          limit: 21,
        });
        return data ?? [];
      },
      staleTime: 5 * 60 * 1000,
    });
  } catch (error: any) {
    if (isAccessDeniedError(error)) {
      console.log('[prefetchService] Skipping tickets prefetch - no access to property');
    } else {
      console.error('[prefetchService] Tickets prefetch error:', error);
    }
  }
}

// ---------------------------------------------------------------------------
// Important Prefetch (runs after UI settles)
// ---------------------------------------------------------------------------

export async function prefetchImportantOnLogin(propertyId: string): Promise<void> {
  if (!propertyId || propertyId === 'all') return;

  await Promise.allSettled([
    // Primary Tickets List
    queryClient.prefetchQuery({
      queryKey: [...queryKeys.property.tickets(propertyId), 'all', 'all', 'false', '50'],
      queryFn: async () => {
        const res = await serverApi.query({
          table: 'tickets',
          action: 'select',
          select: `*, category:issue_categories(name, code), skill_group:skill_groups(name, code), assignee:users!assigned_to(id, full_name, user_photo_url, property_memberships(role, property_id)), creator:users!raised_by(id, full_name, email, property_memberships(role, property_id)), material_requests:procurement_material_requests(id, status)`,
          filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
          orders: [{ column: 'created_at', ascending: false }],
          limit: 50,
        });
        const items = (res.data ?? []) as any[];
        return { tickets: items, hasMore: false, statusCounts: { all: items.length } };
      },
      staleTime: 5 * 60 * 1000,
    }),
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
          select: 'role, users(id,full_name,user_photo_url)',
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