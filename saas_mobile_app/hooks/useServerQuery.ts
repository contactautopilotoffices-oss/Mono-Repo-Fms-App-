import { useQuery, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';

/**
 * Proper React Query wrapper that returns actual data.
 *
 * Replaces useDashboardFetch which stored only timestamps.
 * This hook stores and returns the full server response.
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
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>
): UseQueryResult<T> {
  return useQuery<T>({
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
