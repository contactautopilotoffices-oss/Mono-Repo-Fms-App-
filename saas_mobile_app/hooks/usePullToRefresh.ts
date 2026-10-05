import { useCallback, useRef, useState } from 'react';

/**
 * Drives a RefreshControl from an explicit user gesture.
 *
 * Screens were binding `refreshing={isFetching}`, which is true for ANY fetch,
 * including background revalidation that React Query performs on mount or after
 * a cache invalidation. The result: a full pull-to-refresh spinner appeared over
 * a screen that already had data on it, so ordinary navigation looked like
 * loading. That reads as slowness even when nothing is actually slow.
 *
 * Usage:
 *   const { refreshing, onRefresh } = usePullToRefresh(refetch);
 *   <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
 */
export function usePullToRefresh(
  refresh: () => unknown | Promise<unknown>
): { refreshing: boolean; onRefresh: () => void } {
  const [refreshing, setRefreshing] = useState(false);
  // Guards against a second gesture landing while the first is still in flight.
  const inFlight = useRef(false);

  const onRefresh = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);

    void (async () => {
      try {
        await refresh();
      } catch {
        // Swallowed on purpose: the query itself owns error reporting, and the
        // spinner must come down either way.
      } finally {
        inFlight.current = false;
        setRefreshing(false);
      }
    })();
  }, [refresh]);

  return { refreshing, onRefresh };
}

export default usePullToRefresh;
