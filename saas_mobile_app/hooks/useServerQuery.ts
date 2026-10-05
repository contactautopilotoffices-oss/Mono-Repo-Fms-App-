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
    retry: 1,
    refetchOnWindowFocus: false,
    networkMode: 'offlineFirst',
    // Guard against an unresolved id in the key (e.g. a route param that is still
    // undefined on first render) without disabling a query whose last key segment
    // is legitimately an empty string, 0 or false — a filter or search term, say.
    // The old `!!queryKey[queryKey.length - 1]` silently never ran those.
    enabled: queryKey.every((part) => part !== undefined && part !== null),
    ...options,
  });
}
