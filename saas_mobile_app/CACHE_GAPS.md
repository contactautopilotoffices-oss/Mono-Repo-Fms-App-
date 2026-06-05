# CACHE GAPS — Mobile App Audit

---

## 1. React Query Configuration

### Current State
```ts
// queryClient.ts
defaultOptions: {
  queries: {
    staleTime: 5 * 60 * 1000,      // 5 min
    gcTime: 24 * 60 * 60 * 1000,  // 24 hours (!)
    retry: 2,
    refetchOnWindowFocus: false,
    networkMode: 'offlineFirst',
  }
}
```

### Gaps

| Gap | Problem | Impact |
|-----|---------|--------|
| `gcTime: 24h` for all queries | Cache grows unbounded | Memory bloat |
| `staleTime: 5min` for all queries | Too aggressive re-fetching | Wasted bandwidth |
| `refetchOnWindowFocus: false` | Misses updates when app returns | Stale data |
| No per-query staleTime | Dashboard needs 30s, reports need 1h | Wrong cache strategy |
| No query cancellation on unmount | Memory leaks, wasted requests | Performance |

---

## 2. Screen-by-Screen Cache Strategy

| Screen | Strategy | Current | Should Be | Gap |
|--------|----------|---------|-----------|-----|
| **Dashboard counts** | Cache-first | `staleTime: 5min` | 30s | P1 |
| **Ticket list** | Network-first | `staleTime: 5min` | 60s + SWR | P1 |
| **Ticket detail** | Network-first | `staleTime: 5min` | 0s (real-time) | P1 |
| **Notifications** | Network-first | `staleTime: 5min` | 0s (polling) | P1 |
| **Visitors** | Cache-first | `staleTime: 5min` | 30s | P2 |
| **Stock list** | Network-first | `staleTime: 5min` | 60s | P2 |
| **PPM schedules** | Cache-first | `staleTime: 5min` | 5min | OK |
| **Settings** | Cache-only | `staleTime: 5min` | Infinity | P2 |

---

## 3. Zustand Stores

| Store | Persistence | Issue |
|-------|-------------|-------|
| `authStore` | MMKV | ✅ Persists session |
| `dashboardStore` | Memory only | ❌ Lost on refresh |
| `meetingRoomStore` | Memory only | ❌ Lost on refresh |
| `appStore` | Memory only | ❌ Lost on refresh |
| `prefetchService` | Fetches but doesn't persist | ❌ Prefetch wasted on cold start |

---

## 4. MMKV Storage

| Usage | File | Issue |
|-------|------|-------|
| React Query cache | `react-query-cache` | ✅ MMKV-backed |
| Auth session | Supabase default | ✅ Automatic |
| Theme preference | `ThemeContext` | ✅ MMKV via storage util |
| Property selection | URL params | ❌ Not persisted (lost on close) |
| Draft forms | Not implemented | ❌ No draft saving |

---

## 5. Missing Prefetch Opportunities

| Screen | Prefetch Trigger | Currently |
|--------|-----------------|----------|
| **Ticket detail** | Tap on list item | No prefetch |
| **Stock item** | Tap on list item | No prefetch |
| **Visitor profile** | Tap on visitor | No prefetch |
| **PPM task detail** | Tap on schedule | No prefetch |
| **Procurement request** | Tap on request | No prefetch |
| **User profile** | Tap on user in list | No prefetch |

**Fix:** Add `queryClient.prefetchQuery()` in `onPress` handlers.

---

## 6. Offline Support

| Feature | Offline Read | Offline Write | Gap |
|---------|-------------|-------------|-----|
| **Ticket list** | ✅ Cached (24h gcTime) | ❌ Fails | P1: Queue writes |
| **Notifications** | ✅ Cached | ❌ N/A | OK |
| **Stock list** | ✅ Cached | ❌ Fails | P1: Queue writes |
| **PPM schedules** | ✅ Cached | ❌ Fails | P1: Queue writes |
| **Settings** | ✅ Cached | ✅ Local only | OK |
| **Meeting rooms** | ✅ Cached | ❌ Fails | P1 |

---

## 7. Cache Invalidation Strategy

| Event | Should Invalidate | Does It? |
|-------|-----------------|----------|
| **Property switch** | All queries for old property | ❌ **NO** (P0 bug) |
| **Ticket status change** | Ticket list, counts | ❌ Partial (manual refetch) |
| **New visitor** | Visitor list | ❌ No invalidation |
| **Stock update** | Stock list | ❌ No invalidation |
| **Logout** | All queries | ❌ Cache not cleared on logout |
| **App update** | All queries | ❌ Schema changes not handled |
