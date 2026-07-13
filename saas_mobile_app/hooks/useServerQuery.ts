// @ts-nocheck
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

/**
 * Proper React Query wrapper that returns actual data.
 *
 * Features:
 * - Shows cached data instantly
 * - Re-renders when fresh data arrives
 * - Smart isLoading: only shows on first mount with no cache
 *
 * Usage:
 *   const { data, isLoading, isFetching, error, refetch } = useServerQuery(
 *     ['tickets', propertyId],
 *     () => fetchTickets(propertyId),
 *     { staleTime: 1000 * 60 * 5 }
 *   );
 */
export function useServerQuery<T>(
  queryKey: readonly string[],
  queryFn: () => Promise<T>,
  options?: Omit<Parameters<typeof useQuery<T, Error, T, readonly string[]>>[0], 'queryKey' | 'queryFn'>
): UseQueryResult<T, Error> {
  return useQuery<T, Error, T, readonly string[]>({
    queryKey,
    queryFn,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 2,
    refetchOnWindowFocus: false,
    networkMode: 'offlineFirst',
    enabled: !!queryKey[queryKey.length - 1],
    ...options,
  });
}
