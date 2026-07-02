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

export interface WaterStats {
  quantity: number;
  cost: number;
}

export interface PpmStats {
  total: number;
  done: number;
  pending: number;
  overdue: number;
  postponed: number;
}

export interface PpmSchedule {
  id: string;
  system_name: string;
  detail_name?: string | null;
  planned_date: string;
  status: 'pending' | 'done' | 'postponed' | 'skipped';
  frequency: string;
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
  waterStats: WaterStats;
  healthScore: number;
  attentionItems: AttentionItem[];
  tenantUserIds: string[];
  ppm: PpmStats;
  ppmSchedules: PpmSchedule[];
  fetchedAt: number;
}

// ────────────────────────────────────────────────────────────────
// Fetch Function
// ────────────────────────────────────────────────────────────────

export async function fetchDashboardData(propertyId: string): Promise<DashboardData> {
  try {
    const result = await serverApi.get<DashboardData>('/api/dashboard/property-admin', { propertyId });

    if (result.error) {
      throw new Error(result.error.message);
    }

    if (!result.data) {
      throw new Error('No data returned from dashboard API');
    }

    return result.data;
  } catch (error) {
    console.error('[fetchDashboardData] Exception:', error);
    throw error;
  }
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
    refetchOnMount: 'always',
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