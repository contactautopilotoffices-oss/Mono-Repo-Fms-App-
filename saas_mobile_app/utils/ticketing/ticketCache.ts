import { queryClient } from '@/utils/queryClient';
import { queryKeys } from '@/utils/queryKeys';

/**
 * Optimistic cache patching for tickets.
 *
 * The problem this replaces: screens hand-rolled their optimistic writes with
 * `queryClient.setQueryData(['tickets', propertyId], ...)`. That is an EXACT key
 * lookup, but the list query registers under
 * `['tickets', propertyId, statusFilter, dateRange, needsAttention, limit]`, so
 * the lookup always missed. The writes also expected a `{ data: Ticket[] }`
 * shape while the list actually caches `{ tickets, hasMore, statusCounts }`.
 * Both bugs together meant the optimistic update silently did nothing, and the
 * list only showed a new status after a full network refetch. That is what made
 * "mark closed" feel like it took seconds.
 *
 * Everything here uses PREFIX matching, so one call updates every cached filter
 * and pagination variant of the list at once.
 */

/** Shape the ticket list screen stores under its query key. */
interface CachedTicketList {
  tickets: Array<Record<string, any>>;
  hasMore?: boolean;
  statusCounts?: Record<string, number>;
}

/** Shape the ticket detail screen stores under its query key. */
interface CachedTicketDetail {
  ticket?: Record<string, any>;
  [key: string]: unknown;
}

/** Snapshot of everything a patch touched, for rollback. */
export interface TicketCacheSnapshot {
  lists: Array<[readonly unknown[], unknown]>;
  detail: [readonly unknown[], unknown] | null;
}

/**
 * Apply `patch` to one ticket everywhere it is cached, and return a snapshot for
 * rollback.
 *
 * Call before firing the request; pass the snapshot to `rollbackTicketPatch` if
 * the request fails.
 */
export function patchTicketEverywhere(
  propertyId: string,
  ticketId: string,
  patch: Record<string, any>
): TicketCacheSnapshot {
  const listPrefix = queryKeys.property.tickets(propertyId);
  const detailKey = queryKeys.property.ticketDetail(ticketId);

  // Snapshot every matching list variant before mutating any of them.
  const lists = queryClient
    .getQueriesData<CachedTicketList>({ queryKey: listPrefix })
    .map(([key, data]) => [key, data] as [readonly unknown[], unknown]);

  const detailBefore = queryClient.getQueryData(detailKey);

  // Prefix match, so every filter/date-range/page variant updates together.
  queryClient.setQueriesData<CachedTicketList>({ queryKey: listPrefix }, (old) => {
    if (!old?.tickets) return old;
    let changed = false;
    const tickets = old.tickets.map((t) => {
      if (t?.id !== ticketId) return t;
      changed = true;
      return { ...t, ...patch };
    });
    // Returning the same object when nothing matched avoids a pointless re-render
    // of every screen subscribed to this key.
    return changed ? { ...old, tickets } : old;
  });

  queryClient.setQueryData<CachedTicketDetail>(detailKey, (old) => {
    if (!old) return old;
    if (old.ticket) return { ...old, ticket: { ...old.ticket, ...patch } };
    // Legacy cache entries stored the raw ticket at the top level.
    if ((old as any).id === ticketId) return { ...old, ...patch };
    return old;
  });

  return {
    lists,
    detail: detailBefore === undefined ? null : [detailKey, detailBefore],
  };
}

/** Restore a snapshot taken by `patchTicketEverywhere`. */
export function rollbackTicketPatch(snapshot: TicketCacheSnapshot | null): void {
  if (!snapshot) return;
  for (const [key, data] of snapshot.lists) {
    queryClient.setQueryData(key as any, data);
  }
  if (snapshot.detail) {
    queryClient.setQueryData(snapshot.detail[0] as any, snapshot.detail[1]);
  }
}

/**
 * Adjust the list's status-count tiles for a status transition.
 *
 * Without this the row moves to its new status instantly but the counts above it
 * stay stale until the next refetch, which reads as "it didn't work".
 */
export function patchTicketStatusCounts(
  propertyId: string,
  fromStatus: string | undefined,
  toStatus: string
): void {
  if (!fromStatus || fromStatus === toStatus) return;

  const OPEN = ['open', 'assigned', 'in_progress', 'wait_list'];
  const CLOSED = ['completed', 'resolved', 'closed', 'pending_validation'];

  const bucketOf = (status: string): 'open' | 'closed' | null => {
    if (OPEN.includes(status)) return 'open';
    if (CLOSED.includes(status)) return 'closed';
    return null;
  };

  const from = bucketOf(fromStatus);
  const to = bucketOf(toStatus);
  if (from === to) return;

  const shift = (counts: Record<string, number>): Record<string, number> => {
    const next = { ...counts };
    if (from && typeof next[from] === 'number') next[from] = Math.max(0, next[from] - 1);
    if (to && typeof next[to] === 'number') next[to] = next[to] + 1;
    return next;
  };

  // Counts live in their own cache entry (keyed `[..., 'status-counts', ...]`) so
  // that paginating the list does not recompute them. Prefix-matching the ticket
  // key reaches both that entry and any list entry that still embeds counts.
  queryClient.setQueriesData<any>({ queryKey: queryKeys.property.tickets(propertyId) }, (old) => {
    if (!old) return old;
    // The dedicated counts entry: a flat { all, mine, open, closed } map.
    if (typeof old.all === 'number' || typeof old.open === 'number') {
      return shift(old as Record<string, number>);
    }
    // A list entry that carries counts alongside its rows.
    if (old.statusCounts) {
      return { ...old, statusCounts: shift(old.statusCounts) };
    }
    return old;
  });
}
