/**
 * Staff Dashboard Query Hook
 *
 * SOURCE OF TRUTH: React Query
 *
 * Dedicated hook for Staff dashboard with all staff-specific data.
 */
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { serverApi } from '@/lib/serverApi';
import { ppmService } from '@/services/ppmService';
import { queryKeys } from '@/utils/queryKeys';
import { queryClient } from '@/utils/queryClient';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export interface StaffTicket {
  id: string;
  ticket_number: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  assigned_to?: string | null;
  assignee?: {
    full_name: string;
    email: string;
    user_photo_url?: string | null;
  } | null;
  creator?: { full_name: string } | null;
  photo_before_url?: string;
  sla_due_at?: string;
}

export interface StaffDashboardData {
  property: { name: string } | null;
  tickets: StaffTicket[];
  isCheckedIn: boolean;
  userSkills: string[];
  specialization: string | null;
  ppm: {
    total: number;
    done: number;
    pending: number;
    overdue: number;
    postponed: number;
  };
  fetchedAt: number;
}

// ────────────────────────────────────────────────────────────────
// Fetch Function
// ────────────────────────────────────────────────────────────────

export async function fetchStaffDashboardData(
  propertyId: string,
  userId: string
): Promise<StaffDashboardData> {
  // Helper to safely get data from serverApi responses
  const getData = <T,>(res: any): T | null => res?.data ?? null;

  const [propRes, ticketRes, shiftRes, skillsRes, resolverStatsRes, ppmRes] = await Promise.allSettled([
    serverApi.query({ table: 'properties', action: 'select', select: 'name', filters: [{ op: 'eq', column: 'id', value: propertyId }], limit: 1, maybeSingle: true }),
    serverApi.query({ table: 'tickets', action: 'select', select: '*', filters: [{ op: 'eq', column: 'property_id', value: propertyId }], orders: [{ column: 'created_at', ascending: false }] }),
    serverApi.query({ table: 'resolver_stats', action: 'select', select: 'is_checked_in', filters: [{ op: 'eq', column: 'property_id', value: propertyId }, { op: 'eq', column: 'user_id', value: userId }], limit: 1, maybeSingle: true }),
    serverApi.query({ table: 'mst_skills', action: 'select', select: 'skill_group_code', filters: [{ op: 'eq', column: 'user_id', value: userId }, { op: 'eq', column: 'property_id', value: propertyId }], limit: 1, maybeSingle: true }),
    serverApi.query({ table: 'resolver_stats', action: 'select', select: 'is_available, active_shift_id', filters: [{ op: 'eq', column: 'property_id', value: propertyId }, { op: 'eq', column: 'user_id', value: userId }], limit: 1, maybeSingle: true }),
    ppmService.fetchStats(propertyId),
  ]);

  // Extract data from PromiseSettledResult
  const propData = propRes.status === 'fulfilled' ? getData<any>(propRes.value) : null;
  const ticketData = (ticketRes.status === 'fulfilled' ? getData<any[]>(ticketRes.value) : null) || [];
  const shiftData = shiftRes.status === 'fulfilled' ? getData<any>(shiftRes.value) : null;
  const skillsData = skillsRes.status === 'fulfilled' ? getData<any>(skillsRes.value) : null;
  const resolverData = resolverStatsRes.status === 'fulfilled' ? getData<any>(resolverStatsRes.value) : null;
  const ppmValue = ppmRes.status === 'fulfilled' ? ppmRes.value : null;
  const ppmData = ppmValue?.success ? ppmValue.data : null;

  return {
    property: propData?.name ? { name: propData.name } : null,
    tickets: ticketData as StaffTicket[],
    isCheckedIn: shiftData?.is_checked_in ?? false,
    userSkills: skillsData?.skill_group_code ? [skillsData.skill_group_code] : [],
    specialization: skillsData?.skill_group_code ?? null,
    ppm: {
      total: ppmData?.total ?? 0,
      done: ppmData?.done ?? 0,
      pending: ppmData?.pending ?? 0,
      overdue: ppmData?.overdue ?? 0,
      postponed: ppmData?.postponed ?? 0,
    },
    fetchedAt: Date.now(),
  };
}

// ────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────

const DEFAULT_STALE_TIME = 1000 * 60 * 5;
const DEFAULT_GC_TIME = 1000 * 60 * 60 * 24;

export interface UseStaffDashboardQueryOptions {
  userId: string;
  staleTime?: number;
  gcTime?: number;
  enabled?: boolean;
  initialLoadingOnMount?: boolean;
}

export interface UseStaffDashboardQueryResult {
  data: StaffDashboardData | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isStale: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  forceRefresh: () => Promise<void>;
}

export function useStaffDashboardQuery(
  propertyId: string,
  options: UseStaffDashboardQueryOptions
): UseStaffDashboardQueryResult {
  const { userId, staleTime = DEFAULT_STALE_TIME, gcTime = DEFAULT_GC_TIME, enabled = true, initialLoadingOnMount = false } = options;

  const queryKey = queryKeys.property.dashboardStaff(propertyId);

  const queryResult = useQuery<StaffDashboardData, Error>({
    queryKey,
    queryFn: () => fetchStaffDashboardData(propertyId, userId),
    staleTime,
    gcTime,
    enabled: enabled && !!propertyId && !!userId && propertyId !== 'all',
    refetchOnWindowFocus: false,
    retry: 2,
    networkMode: 'offlineFirst',
    placeholderData: keepPreviousData, // Keep showing old data until new arrives
  });

  return {
    data: queryResult.data,
    isLoading: initialLoadingOnMount ? queryResult.isLoading : (!queryResult.data ? queryResult.isLoading : false),
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

export function getCachedStaffDashboard(propertyId: string): StaffDashboardData | null {
  return queryClient.getQueryData<StaffDashboardData>(queryKeys.property.dashboardStaff(propertyId)) ?? null;
}

export function setCachedStaffDashboard(propertyId: string, data: StaffDashboardData): void {
  queryClient.setQueryData<StaffDashboardData>(queryKeys.property.dashboardStaff(propertyId), data);
}

export function invalidateStaffDashboard(propertyId: string): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.property.dashboardStaff(propertyId),
  });
}