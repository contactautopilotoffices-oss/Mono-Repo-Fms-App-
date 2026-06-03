/**
 * Prefetch Service — Critical Screen Data Loader
 *
 * Provides fetchers that warm React Query + Zustand cache on login,
 * so dashboard/tickets appear instantly on day 2 without network delay.
 *
 * Tier 1 (Critical — prefetched immediately on login):
 *   - Dashboard counts (tickets, sop, energy)
 *   - Ticket list
 *
 * Tier 2 (Important — prefetched after UI settles):
 *   - Checklist data
 *   - Diesel/Electricity data
 *   - Users/stock/procurement
 */

import { serverApi } from '@/lib/serverApi';
import { queryClient } from '@/utils/queryClient';
import { queryKeys } from '@/utils/queryKeys';
import { useDashboardStore } from '@/stores/dashboardStore';

// ---------------------------------------------------------------------------
// Dashboard Counts Fetcher
// ---------------------------------------------------------------------------

export async function fetchDashboardCounts(propertyId: string): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split('T')[0];

  try {
    // Fetch all ticket counts in parallel
    const [allRes, monthRes, todayRes] = await Promise.all([
      serverApi.query<any[]>({
        table: 'tickets',
        action: 'select',
        select: 'id, status, created_at',
        filters: [
          { op: 'eq', column: 'property_id', value: propertyId },
        ],
      }),
      serverApi.query<any[]>({
        table: 'tickets',
        action: 'select',
        select: 'id, status',
        filters: [
          { op: 'eq', column: 'property_id', value: propertyId },
          { op: 'gte', column: 'created_at', value: monthStart },
        ],
      }),
      serverApi.query<any[]>({
        table: 'tickets',
        action: 'select',
        select: 'id, status',
        filters: [
          { op: 'eq', column: 'property_id', value: propertyId },
          { op: 'gte', column: 'created_at', value: today },
        ],
      }),
    ]);

    const countBucket = (tickets: any[], statuses: string[]) => {
      const filtered = statuses.length
        ? tickets.filter((t) => statuses.includes(t.status))
        : tickets;
      return { total: filtered.length, open: filtered.filter((t) => t.status !== 'closed' && t.status !== 'resolved').length, closed: filtered.filter((t) => t.status === 'closed' || t.status === 'resolved').length };
    };

    const ticketCounts = {
      all: countBucket(allRes.data ?? [], []),
      month: countBucket(monthRes.data ?? [], []),
      today: countBucket(todayRes.data ?? [], []),
    };

    // Also fetch SOP count
    const [sopRes] = await Promise.all([
      serverApi.query<any[]>({
        table: 'sop_templates',
        action: 'select',
        select: 'id, is_running',
        filters: [
          { op: 'eq', column: 'property_id', value: propertyId },
          { op: 'eq', column: 'is_active', value: true },
        ],
      }),
    ]);

    const sopTotal = (sopRes.data ?? []).length;
    const sopCount = (sopRes.data ?? []).filter((s: any) => s.is_running).length;

    // Update Zustand store with fetched counts
    useDashboardStore.getState().setDashboardData({
      ticketCounts,
      sopCount,
      sopTotal,
      loadedPropertyId: propertyId,
      hasLoadedInitialData: true,
      lastUpdatedAt: Date.now(),
    });
    return true;
  } catch (err) {
    console.warn('[prefetchService] fetchDashboardCounts failed:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Ticket List Fetcher
// ---------------------------------------------------------------------------

export async function fetchTicketList(propertyId: string): Promise<boolean> {
  try {
    const { data, error } = await serverApi.query<any[]>({
      table: 'tickets',
      action: 'select',
      select: '*',
      filters: [
        { op: 'eq', column: 'property_id', value: propertyId },
      ],
      orders: [{ column: 'created_at', ascending: false }],
      limit: 100,
    });

    if (error) throw new Error(error.message);

    useDashboardStore.getState().setDashboardData({
      tickets: (data ?? []) as any,
    });
    return true;
  } catch (err) {
    console.warn('[prefetchService] fetchTicketList failed:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Attention Items Fetcher
// ---------------------------------------------------------------------------

export async function fetchAttentionItems(propertyId: string): Promise<boolean> {
  try {
    const { data } = await serverApi.query<any[]>({
      table: 'attention_items',
      action: 'select',
      select: '*',
      filters: [
        { op: 'eq', column: 'property_id', value: propertyId },
      ],
      orders: [{ column: 'created_at', ascending: false }],
      limit: 50,
    });

    useDashboardStore.getState().setDashboardData({
      attentionItems: (data ?? []) as any,
    });
    return true;
  } catch (err) {
    console.warn('[prefetchService] fetchAttentionItems failed:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tenant User IDs Fetcher
// ---------------------------------------------------------------------------

export async function fetchTenantUserIds(propertyId: string): Promise<boolean> {
  try {
    const { data } = await serverApi.query<any[]>({
      table: 'property_memberships',
      action: 'select',
      select: 'user_id',
      filters: [
        { op: 'eq', column: 'property_id', value: propertyId },
        { op: 'eq', column: 'role', value: 'tenant' },
      ],
    });

    useDashboardStore.getState().setDashboardData({
      tenantUserIds: (data ?? []).map((m: any) => m.user_id),
    });
    return true;
  } catch (err) {
    console.warn('[prefetchService] fetchTenantUserIds failed:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// All Critical Prefetch (runs on login)
// ---------------------------------------------------------------------------

export async function prefetchCriticalOnLogin(
  propertyId: string,
  options?: { signal?: AbortSignal }
): Promise<void> {
  if (!propertyId) return;

  await Promise.allSettled([
    fetchDashboardCounts(propertyId),
    fetchTicketList(propertyId),
    fetchAttentionItems(propertyId),
    fetchTenantUserIds(propertyId),
  ]);

  // Also prefetch into React Query cache
  await Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: queryKeys.property.dashboard(propertyId),
      queryFn: () => fetchDashboardCounts(propertyId),
      staleTime: 5 * 60 * 1000,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.property.tickets(propertyId),
      queryFn: () => fetchTicketList(propertyId),
      staleTime: 5 * 60 * 1000,
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Important Prefetch (runs after UI settles)
// ---------------------------------------------------------------------------

export async function prefetchImportantOnLogin(
  propertyId: string
): Promise<void> {
  if (!propertyId) return;

  await Promise.allSettled([
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
        const res = await serverApi.query({ table: 'generators', action: 'select', filters: [{ op: 'eq', column: 'property_id', value: propertyId }] });
        return res;
      },
      staleTime: 5 * 60 * 1000,
    }),
    // Electricity
    queryClient.prefetchQuery({
      queryKey: queryKeys.property.electricity(propertyId),
      queryFn: async () => {
        const res = await serverApi.query({ table: 'electricity_readings', action: 'select', filters: [{ op: 'eq', column: 'property_id', value: propertyId }], limit: 100 });
        return res;
      },
      staleTime: 5 * 60 * 1000,
    }),
    // Users
    queryClient.prefetchQuery({
      queryKey: queryKeys.property.users(propertyId),
      queryFn: async () => {
        const res = await serverApi.query({ table: 'property_memberships', action: 'select', select: 'role, users(id,full_name,user_photo_url)', filters: [{ op: 'eq', column: 'property_id', value: propertyId }] });
        return res;
      },
      staleTime: 5 * 60 * 1000,
    }),
    // Stock
    queryClient.prefetchQuery({
      queryKey: queryKeys.property.stock(propertyId),
      queryFn: async () => {
        const res = await serverApi.query({ table: 'stock_items', action: 'select', filters: [{ op: 'eq', column: 'property_id', value: propertyId }], limit: 100 });
        return res;
      },
      staleTime: 5 * 60 * 1000,
    }),
  ]);
}