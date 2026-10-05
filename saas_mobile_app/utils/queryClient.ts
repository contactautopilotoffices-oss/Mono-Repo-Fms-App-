import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

// ── Safe MMKV initialization ───────────────────────────────────────────────
let mmkvStorage: any;
try {
  const { MMKV } = require('react-native-mmkv');
  mmkvStorage = new MMKV({ id: 'react-query-cache' });
} catch (e) {
  console.warn('[queryClient] MMKV not available, falling back to in-memory');
  const store = new Map<string, string>();
  mmkvStorage = {
    set: (key: string, value: string) => store.set(key, value),
    getString: (key: string) => store.get(key),
    delete: (key: string) => store.delete(key),
  };
}

const clientStorage = {
  setItem: (key: string, value: string) => {
    mmkvStorage.set(key, value);
  },
  getItem: (key: string) => {
    const value = mmkvStorage.getString(key);
    return value === undefined ? null : value;
  },
  removeItem: (key: string) => {
    mmkvStorage.delete(key);
  },
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Data is fresh for 5 mins
      gcTime: 1000 * 60 * 60 * 24, // Keep for 1 day (was 7d — see PERSISTED_QUERY_PREFIXES)
      retry: 1,
      refetchOnWindowFocus: false, // Mobile uses AppState, not window focus
      // `true` (not 'always') so cached data paints instantly and we only hit the
      // network when the entry is actually stale. 'always' made staleTime a no-op
      // and meant every screen mount paid a full network round trip.
      refetchOnMount: true,
      networkMode: 'offlineFirst',
    },
    mutations: {
      // Never auto-replay a write. A timed-out mutation may well have landed, so
      // retrying risks duplicate inserts and double state transitions.
      retry: 0,
      networkMode: 'offlineFirst',
    },
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Persistence allowlist
// ───────────────────────────────────────────────────────────────────────────
// The sync persister JSON.stringify's the WHOLE dehydrated cache on the JS
// thread every time it flushes. Persisting everything meant multi-megabyte
// stringify passes during normal use (the single biggest source of UI jank) and
// a large blocking JSON.parse at boot.
//
// Only cold-start-critical entries are worth persisting: the things a user sees
// first and that make the app feel instant on launch. Everything else is cheap
// to refetch and stays in memory only.
const PERSISTED_QUERY_PREFIXES = [
  'mst-dashboard',
  'staff-dashboard',
  'property-dashboard',
  'dashboard',
  'tickets',
  'ticket-detail',
  'user-profile',
  'memberships',
  'property-modules',
  'capabilities',
];

/** Entries larger than this are skipped by the persister (keeps the blob small). */
const MAX_PERSISTED_ENTRY_BYTES = 256 * 1024;

export const mmkvPersister = createSyncStoragePersister({
  storage: clientStorage,
  key: 'autopilot-react-query-cache',
  // 1s meant a full-cache stringify up to once a second during any activity.
  throttleTime: 5000,
});

/**
 * Decides whether a query is written to disk.
 *
 * Passed to PersistQueryClientProvider's `dehydrateOptions`. Keep this in sync
 * with PERSISTED_QUERY_PREFIXES rather than inlining the rule at the call site.
 */
export function shouldPersistQuery(query: any): boolean {
  if (query?.state?.status !== 'success') return false;

  const root = Array.isArray(query.queryKey) ? query.queryKey[0] : query.queryKey;
  if (typeof root !== 'string') return false;
  if (!PERSISTED_QUERY_PREFIXES.includes(root)) return false;

  // Guard against one oversized entry (a long list, a base64 blob) bloating the
  // whole persisted payload and slowing every future flush and the next boot.
  try {
    const size = JSON.stringify(query.state.data)?.length ?? 0;
    if (size > MAX_PERSISTED_ENTRY_BYTES) return false;
  } catch {
    return false; // non-serialisable payload
  }

  return true;
}
