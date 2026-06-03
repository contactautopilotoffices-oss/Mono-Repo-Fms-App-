import { useServerQuery } from '@/hooks/useServerQuery';

interface PropertyQueryOptions<T> {
  propertyId: string;
  queryKey: readonly string[];
  fetcher: () => Promise<T>;
  staleTime?: number;
  enabled?: boolean;
}

/**
 * Property-aware server query.
 * Automatically includes propertyId in the query key for cache isolation.
 */
export function usePropertyQuery<T>({
  propertyId,
  queryKey,
  fetcher,
  staleTime,
  enabled = true,
}: PropertyQueryOptions<T>) {
  return useServerQuery<T>(
    queryKey,
    fetcher,
    { staleTime, enabled: enabled && !!propertyId }
  );
}
