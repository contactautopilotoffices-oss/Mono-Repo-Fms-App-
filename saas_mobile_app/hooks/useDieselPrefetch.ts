/**
 * Diesel Prefetch Hook
 *
 * Prefetches diesel data ahead of user navigation for instant display.
 * Use this in dashboard or parent layouts to warm the cache.
 *
 * Usage:
 *   const { prefetchDiesel } = useDieselPrefetch(propertyId);
 *
 *   // In useEffect or on user hover
 *   useEffect(() => { prefetchDiesel(); }, []);
 *
 *   // Or in a parent layout
 *   useLayoutEffect(() => { prefetchDiesel(); }, [propertyId]);
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { dieselService, dieselApi } from '@/services/dieselService';
import { queryKeys } from '@/utils/queryKeys';

interface UseDieselPrefetchOptions {
  /** Stale time in ms - how long until data is considered stale */
  staleTime?: number;
  /** Property ID to prefetch for */
  propertyId: string;
}

interface UseDieselPrefetchResult {
  /** Prefetch diesel data for fast navigation */
  prefetchDiesel: () => Promise<void>;
  /** Check if data is already cached */
  isCached: boolean;
  /** Get cached diesel data if available */
  getCachedData: () => { generators: any[]; readings: any[]; lastClosings: any } | undefined;
}

/**
 * Hook for prefetching diesel data ahead of navigation.
 * Use in dashboard or layout components.
 */
export function useDieselPrefetch({ propertyId }: UseDieselPrefetchOptions): UseDieselPrefetchResult {
  const queryClient = useQueryClient();

  const getCachedData = useCallback(() => {
    const cacheKey = queryKeys.property.diesel(propertyId);
    const cached = queryClient.getQueryData(cacheKey);
    return cached as { generators: any[]; readings: any[]; lastClosings: any } | undefined;
  }, [queryClient, propertyId]);

  const isCached = useCallback(() => {
    return getCachedData() !== undefined;
  }, [getCachedData]);

  const prefetchDiesel = useCallback(async () => {
    if (!propertyId) return;

    // Prefetch using React Query - this will run in background
    // and populate the cache for instant display when user navigates
    await queryClient.prefetchQuery({
      queryKey: queryKeys.property.diesel(propertyId),
      queryFn: async () => {
        // Use the optimized fetchAll which uses parallel queries
        const result = await dieselService.fetchAll(propertyId);
        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch diesel data');
        }
        return result.data;
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes
    });

    // Also prefetch analytics data for the analytics screen
    await queryClient.prefetchQuery({
      queryKey: queryKeys.property.dieselAnalytics(propertyId),
      queryFn: async () => {
        const result = await dieselApi.fetchAnalytics(propertyId);
        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch diesel analytics');
        }
        return result.data;
      },
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    });
  }, [queryClient, propertyId]);

  return {
    prefetchDiesel,
    isCached: isCached(),
    getCachedData: getCachedData(),
  };
}

/**
 * Component that prefetches diesel data on mount.
 * Drop this into dashboard layouts for automatic prefetching.
 */
export function DieselPrefetchProvider({ propertyId }: { propertyId: string }) {
  const { prefetchDiesel } = useDieselPrefetch({ propertyId });

  // Prefetch on mount
  prefetchDiesel();

  return null; // No UI
}

export default useDieselPrefetch;