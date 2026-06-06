/**
 * Unified Dashboard Query Hook
 *
 * SOURCE OF TRUTH: React Query
 *
 * This hook replaces useDashboardFetch which only stored timestamps.
 * Now stores actual dashboard payload in React Query cache.
 *
 * Features:
 * - Cache-first: renders immediately from cache
 * - Background refresh: updates UI when fresh data arrives
 * - Property-scoped: separate cache per property
 * - No Zustand duplication: data lives in React Query only
 */
import { useQuery } from '@tanstack/react-query';
import { serverApi } from '@/lib/serverApi';
import { ppmService } from '@/services/ppmService';
import { queryKeys } from '@/utils/queryKeys';
import { queryClient } from '@/utils/queryClient';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export interface DashboardCounts {
  all: { total: number; open: number; closed: number };
  month: { total: number; open: number; closed: number };
  today: { total: number; open: number; closed: number };
}

export interface Ticket {
  id: string;
  ticket_number?: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  created_at: string;
  internal?: boolean;
  raised_by?: string | null;
  photo_before_url?: string | null;
  assigned_to?: string | null;
  assignee?: {
    full_name?: string;
    email?: string;
    user_photo_url?: string | null;
  } | null;
  creator?: { full_name?: string } | null;
  sla_due_at?: string;
}

export interface AttentionItem {
  id: string;
  entity_id: string;
  entity_type: string;
  severity: string;
  type: string;
  title: string;
  description: string;
  action_label: string;
}

export interface TicketFunnelItem {
  status_label: string;
  ticket_count: number;
}

export interface VmsStats {
  total: number;
  in: number;
  out: number;
}

export interface VendorStats {
  revenue: number;
  commission: number;
}

export interface DieselStats {
  level: number;
  consumption: number;
}

export interface PpmStats {
  total: number;
  done: number;
  pending: number;
  overdue: number;
  postponed: number;
}

export interface DashboardData {
  propertyName: string;
  propertyId: string;
  propertyLogoUrl?: string | null;
  tickets: Ticket[];
  ticketCounts: DashboardCounts;
  ticketFunnel: TicketFunnelItem[];
  sopCount: number;
  sopTotal: number;
  energyKwh: number;
  energyTrend: number;
  vmsStats: VmsStats;
  vendorStats: VendorStats;
  dieselStats: DieselStats;
  healthScore: number;
  attentionItems: AttentionItem[];
  tenantUserIds: string[];
  ppm: PpmStats;
  fetchedAt: number;
}

// ────────────────────────────────────────────────────────────────
// Fetch Function
// ────────────────────────────────────────────────────────────────

export async function fetchDashboardData(propertyId: string): Promise<DashboardData> {
  const todayStr = new Date().toISOString().split('T')[0];
  const monthStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

  const safeFetch = <T,>(promise: Promise<any>, fallback: T): Promise<{ data: T; count?: number | null }> =>
    promise
      .then((res) => {
        if (res.error) console.error('[safeFetch] query returned error:', res.error);
        return { data: res.data ?? fallback, count: res.count };
      })
      .catch((err) => {
        console.error('[safeFetch] Exception:', err);
        return { data: fallback, count: null };
      });

  const propFilter = { op: 'eq' as const, column: 'property_id', value: propertyId };
  const idFilter = { op: 'eq' as const, column: 'id', value: propertyId };

  // Bulk queries
  const bulkResults = await Promise.all([
    safeFetch(serverApi.query({ table: 'properties', action: 'select', select: 'name, image_url', filters: [idFilter], single: true }), null),
    safeFetch(serverApi.query({ table: 'tickets', action: 'select', select: 'id, title, status, priority, created_at, raised_by, photo_before_url', filters: [propFilter], orders: [{ column: 'created_at', ascending: false }], limit: 150 }), []),
    safeFetch(serverApi.query({ table: 'sop_templates', action: 'select', select: 'id', filters: [propFilter, { op: 'eq', column: 'is_active', value: true }] }), []),
    safeFetch(serverApi.query({ table: 'sop_completions', action: 'select', select: 'status', filters: [propFilter, { op: 'eq', column: 'completion_date', value: todayStr }] }), []),
    safeFetch(serverApi.query({ table: 'visitor_logs', action: 'select', select: 'status', filters: [propFilter] }), []),
    safeFetch(serverApi.query({ table: 'vendor_daily_revenue', action: 'select', select: 'revenue_amount, vendor_id', filters: [propFilter] }), []),
    safeFetch(serverApi.query({ table: 'tickets', action: 'select', select: 'id', selectOptions: { count: 'exact', head: true }, filters: [propFilter] }), null, 0),
    safeFetch(serverApi.query({ table: 'tickets', action: 'select', select: 'id', selectOptions: { count: 'exact', head: true }, filters: [propFilter, { op: 'in', column: 'status', values: ['open', 'assigned', 'in_progress', 'client_raised', 'waitlist'] }] }), null, 0),
    safeFetch(serverApi.query({ table: 'tickets', action: 'select', select: 'id', selectOptions: { count: 'exact', head: true }, filters: [propFilter, { op: 'in', column: 'status', values: ['resolved', 'closed'] }] }), null, 0),
    safeFetch(serverApi.query({ table: 'tickets', action: 'select', select: 'id', selectOptions: { count: 'exact', head: true }, filters: [propFilter, { op: 'gte', column: 'created_at', value: monthStr }] }), null, 0),
    safeFetch(serverApi.query({ table: 'tickets', action: 'select', select: 'id', selectOptions: { count: 'exact', head: true }, filters: [propFilter, { op: 'gte', column: 'created_at', value: monthStr }, { op: 'in', column: 'status', values: ['open', 'assigned', 'in_progress', 'client_raised', 'waitlist'] }] }), null, 0),
    safeFetch(serverApi.query({ table: 'tickets', action: 'select', select: 'id', selectOptions: { count: 'exact', head: true }, filters: [propFilter, { op: 'gte', column: 'created_at', value: monthStr }, { op: 'in', column: 'status', values: ['resolved', 'closed'] }] }), null, 0),
    safeFetch(serverApi.query({ table: 'tickets', action: 'select', select: 'id', selectOptions: { count: 'exact', head: true }, filters: [propFilter, { op: 'gte', column: 'created_at', value: todayStr }] }), null, 0),
    safeFetch(serverApi.query({ table: 'tickets', action: 'select', select: 'id', selectOptions: { count: 'exact', head: true }, filters: [propFilter, { op: 'gte', column: 'created_at', value: todayStr }, { op: 'in', column: 'status', values: ['open', 'assigned', 'in_progress', 'client_raised', 'waitlist'] }] }), null, 0),
    safeFetch(serverApi.query({ table: 'tickets', action: 'select', select: 'id', selectOptions: { count: 'exact', head: true }, filters: [propFilter, { op: 'gte', column: 'created_at', value: todayStr }, { op: 'in', column: 'status', values: ['resolved', 'closed'] }] }), null, 0),
    safeFetch(serverApi.query({ table: 'property_memberships', action: 'select', select: 'user_id', filters: [propFilter, { op: 'in', column: 'role', values: ['tenant', 'super_tenant'] }] }), []),
  ]);

  const [
    propRes, ticketRes, sopTemplatesRes, sopCompletionsRes, vmsRes, revRes,
    countTotalAll, countOpenAll, countClosedAll,
    countTotalMonth, countOpenMonth, countClosedMonth,
    countTotalToday, countOpenToday, countClosedToday,
    tenantUsersRes
  ] = bulkResults;

  // Per-property queries
  const [elecRes, dieselRes, healthRes, attentionRes, funnelRes, ppmRes] = await Promise.all([
    safeFetch(serverApi.query({ table: 'electricity_readings', action: 'select', select: 'final_units, electricity_meters!inner(property_id)', filters: [{ op: 'eq', column: 'electricity_meters.property_id', value: propertyId }], orders: [{ column: 'created_at', ascending: false }], limit: 1, maybeSingle: true }), null),
    safeFetch(serverApi.query({ table: 'diesel_readings', action: 'select', select: 'closing_diesel_level, generators!inner(property_id)', filters: [{ op: 'eq', column: 'generators.property_id', value: propertyId }], orders: [{ column: 'created_at', ascending: false }], limit: 1, maybeSingle: true }), null),
    safeFetch(serverApi.rpc('get_property_health_score', { p_property_id: propertyId }), null),
    safeFetch(serverApi.rpc('get_attention_items', { p_property_id: propertyId, p_limit: 10 }), []),
    safeFetch(serverApi.rpc('get_ticket_funnel', { p_property_id: propertyId, p_days: 30 }), []),
    ppmService.fetchStats(propertyId).catch(() => ({ success: false, data: null })),
  ]);

  // Build response
  const propData = propRes.data as any;
  const ticketData = (ticketRes.data || []) as Ticket[];
  const sopTemplatesData = (sopTemplatesRes.data || []) as any[];
  const sopCompletionsData = (sopCompletionsRes.data || []) as any[];
  const vmsData = (vmsRes.data || []) as any[];
  const revData = (revRes.data || []) as any[];
  const tenantData = (tenantUsersRes.data || []) as any[];

  const totalVms = vmsData.length;
  const inVms = vmsData.filter((v: any) => v.status === 'checked_in').length;
  const outVms = vmsData.filter((v: any) => v.status === 'checked_out').length;
  const totalRev = revData.reduce((acc: number, row: any) => acc + (row.revenue_amount || 0), 0);
  const sopTotal = sopTemplatesData.length;
  const sopCount = sopCompletionsData.filter((s: any) => s.status === 'completed').length;

  const funnelData = (funnelRes.data || []) as any[];
  const ticketFunnel: TicketFunnelItem[] = funnelData.map((f: any) => ({
    status_label: f.status_label,
    ticket_count: f.ticket_count,
  }));

  const ppmData = ppmRes.success ? ppmRes.data : null;
  const ppm: PpmStats = {
    total: ppmData?.total ?? 0,
    done: ppmData?.done ?? 0,
    pending: ppmData?.pending ?? 0,
    overdue: ppmData?.overdue ?? 0,
    postponed: ppmData?.postponed ?? 0,
  };

  const tenantUserIds = tenantData.map((t: any) => t.user_id).filter(Boolean);

  return {
    propertyId,
    propertyName: propData?.name ?? 'Property',
    propertyLogoUrl: propData?.image_url ?? null,
    tickets: ticketData,
    ticketCounts: {
      all: { total: countTotalAll.count ?? 0, open: countOpenAll.count ?? 0, closed: countClosedAll.count ?? 0 },
      month: { total: countTotalMonth.count ?? 0, open: countOpenMonth.count ?? 0, closed: countClosedMonth.count ?? 0 },
      today: { total: countTotalToday.count ?? 0, open: countOpenToday.count ?? 0, closed: countClosedToday.count ?? 0 },
    },
    ticketFunnel,
    sopCount,
    sopTotal,
    energyKwh: Math.round((elecRes.data as any)?.final_units ?? 0),
    energyTrend: 12,
    vmsStats: { total: totalVms, in: inVms, out: outVms },
    vendorStats: { revenue: totalRev, commission: totalRev * 0.1 },
    dieselStats: { level: (dieselRes.data as any)?.closing_diesel_level ?? 0, consumption: 0 },
    healthScore: typeof healthRes.data === 'number' ? Math.round(healthRes.data) : 100,
    attentionItems: (attentionRes.data || []) as AttentionItem[],
    tenantUserIds,
    ppm,
    fetchedAt: Date.now(),
  };
}

// ────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────

const DEFAULT_STALE_TIME = 1000 * 60 * 5;
const DEFAULT_GC_TIME = 1000 * 60 * 60 * 24;

export interface UseDashboardQueryOptions {
  staleTime?: number;
  gcTime?: number;
  enabled?: boolean;
  initialLoadingOnMount?: boolean;
}

export interface UseDashboardQueryResult {
  data: DashboardData | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isStale: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  forceRefresh: () => Promise<void>;
}

export function useDashboardQuery(
  propertyId: string,
  options: UseDashboardQueryOptions = {}
): UseDashboardQueryResult {
  const {
    staleTime = DEFAULT_STALE_TIME,
    gcTime = DEFAULT_GC_TIME,
    enabled = true,
    initialLoadingOnMount = false,
  } = options;

  const queryKey = queryKeys.property.dashboard(propertyId);

  const queryResult = useQuery<DashboardData, Error>({
    queryKey,
    queryFn: () => fetchDashboardData(propertyId),
    staleTime,
    gcTime,
    enabled: enabled && !!propertyId && propertyId !== 'all',
    refetchOnWindowFocus: false,
    retry: 2,
    networkMode: 'offlineFirst',
  });

  return {
    data: queryResult.data,
    // Show loading ONLY on initial mount (first time, no cache)
    // After initial mount, never show loading - use cached data or background refetch
    isLoading: queryResult.isLoading && (initialLoadingOnMount || !queryResult.data),
    isFetching: queryResult.isFetching,
    isStale: queryResult.isStale,
    error: queryResult.error,
    refetch: queryResult.refetch,
    forceRefresh: async () => { await queryResult.refetch(); },
  };
}

// ────────────────────────────────────────────────────────────────
// Cache Helpers
// ────────────────────────────────────────────────────────────────

export async function prefetchDashboard(propertyId: string): Promise<void> {
  if (!propertyId || propertyId === 'all') return;
  await queryClient.prefetchQuery({
    queryKey: queryKeys.property.dashboard(propertyId),
    queryFn: () => fetchDashboardData(propertyId),
    staleTime: DEFAULT_STALE_TIME,
  });
}

export function getCachedDashboard(propertyId: string): DashboardData | null {
  return queryClient.getQueryData<DashboardData>(queryKeys.property.dashboard(propertyId)) ?? null;
}

export function setCachedDashboard(propertyId: string, data: DashboardData): void {
  queryClient.setQueryData<DashboardData>(queryKeys.property.dashboard(propertyId), data);
}

export function invalidateDashboard(propertyId: string): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.property.dashboard(propertyId),
  });
}