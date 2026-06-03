# React Query Migration Plan — Phase 1

**Date:** 2026-06-02
**Scope:** `useDashboardFetch` hook + `LovableMstDashboard.tsx` only
**Out of Scope:** All other 46 screens (untouched)

---

## Executive Summary

Replace the broken `useDashboardFetch` pattern (React Query as fetch scheduler + local `useState` for data) with a proper React Query architecture (React Query as data cache + UI renders from `query.data`). Phase 1 targets only the MST Dashboard to prove the pattern before app-wide expansion.

---

## 1. Current Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CURRENT (BROKEN)                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────┐                                                   │
│   │  MMKV Persister │──→ Stores Date.now() timestamps ONLY              │
│   └─────────────────┘                                                   │
│           ▲                                                             │
│           │                                                             │
│   ┌───────┴─────────┐                                                   │
│   │  useDashboardFetch│──→ useQuery({ queryFn: async () => {            │
│   │                 │           await fetchData();  // side effects     │
│   │                 │           return Date.now();  // NOT data         │
│   │                 │       })
│   └───────┬─────────┘                                                   │
│           │ returns { refetch } ONLY                                    │
│           │                                                             │
│   ┌───────┴─────────┐                                                   │
│   │ LovableMstDashboard                                                  │
│   │                 │                                                   │
│   │  ┌───────────┐  │                                                   │
│   │  │ useState  │  │──→ property  │──→ null initially                 │
│   │  │           │  │──→ tickets   │──→ [] initially                   │
│   │  │           │  │──→ isCheckedIn│──→ false initially               │
│   │  │           │  │──→ isLoading │──→ !hasMstCache                    │
│   │  └───────────┘  │                                                   │
│   │                 │                                                   │
│   │  ┌───────────┐  │                                                   │
│   │  │ fetchData │  │──→ supabase queries → setState() calls            │
│   │  │  (void)   │  │                                                   │
│   │  └───────────┘  │                                                   │
│   │                 │                                                   │
│   │  ┌───────────┐  │                                                   │
│   │  │ useAsyncStorageCache │──→ Parallel cache (ignored for render)    │
│   │  └───────────┘  │                                                   │
│   │                 │                                                   │
│   │  isLoading ? ──→ Full-screen spinner                                │
│   │                 │                                                   │
│   └─────────────────┘                                                   │
│                                                                         │
│   FAILURE MODE:                                                         │
│   - React Query cache has timestamp (< 5 min old)                       │
│   - useQuery skips queryFn → fetchData NEVER called                     │
│   - setIsLoading(false) NEVER called                                    │
│   - INFINITE SPINNER                                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Target Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          TARGET (FIXED)                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────┐                                                   │
│   │  MMKV Persister │──→ Stores ACTUAL dashboard data                   │
│   │                 │     { property, tickets, isCheckedIn }            │
│   └─────────────────┘                                                   │
│           ▲                                                             │
│           │                                                             │
│   ┌───────┴─────────┐                                                   │
│   │   useServerQuery  │──→ useQuery<T>({                                │
│   │   (NEW HOOK)    │       queryFn: fetchDashboardData,  // returns T  │
│   │                 │    })                                             │
│   └───────┬─────────┘                                                   │
│           │ returns { data, isLoading, isFetching, refetch, error }     │
│           │                                                             │
│   ┌───────┴─────────┐                                                   │
│   │ LovableMstDashboard                                                  │
│   │                 │                                                   │
│   │  ┌───────────┐  │                                                   │
│   │  │ useServerQuery│──→ data: { property, tickets, isCheckedIn }      │
│   │  │             │──→ isLoading: true ONLY when no cache + fetching   │
│   │  │             │──→ isFetching: true during background refresh      │
│   │  └───────────┘  │                                                   │
│   │                 │                                                   │
│   │  ┌───────────┐  │                                                   │
│   │  │  UI State  │  │──→ activeTab, timeFilter, scopeFilter            │
│   │  │  (only)    │  │──→ showCreate, showSignOut, showDrawer           │
│   │  │            │  │──→ isCheckingInOut, activeShiftId                │
│   │  └───────────┘  │                                                   │
│   │                 │                                                   │
│   │  isLoading ? ──→ Spinner ONLY if !data                              │
│   │  data exists ? ─→ Render instantly from cache                       │
│   │  isFetching ? ──→ Show subtle refresh indicator (optional)          │
│   │                 │                                                   │
│   └─────────────────┘                                                   │
│                                                                         │
│   SUCCESS MODE:                                                         │
│   - Navigate back within 5 min                                          │
│   - MMKV restores actual data to React Query cache                      │
│   - useQuery returns cached data instantly                              │
│   - Dashboard renders in < 16ms                                         │
│   - Background refetch runs silently                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Migration Steps

### Step 0: Backup
```bash
cp saas_mobile_app/hooks/useDashboardFetch.ts saas_mobile_app/hooks/useDashboardFetch.ts.bak
cp saas_mobile_app/components/dashboard/LovableMstDashboard.tsx saas_mobile_app/components/dashboard/LovableMstDashboard.tsx.bak
```

### Step 1: Create `useServerQuery` Hook

**New file:** `hooks/useServerQuery.ts`

```typescript
import { useQuery, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';

/**
 * Proper React Query wrapper that returns actual data.
 * 
 * Replaces useDashboardFetch which stored only timestamps.
 * This hook stores and returns the full server response.
 */
export function useServerQuery<T>(
  queryKey: readonly string[],
  queryFn: () => Promise<T>,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>
): UseQueryResult<T> {
  return useQuery<T>({
    queryKey,
    queryFn,
    staleTime: 1000 * 60 * 5,        // 5 minutes
    gcTime: 1000 * 60 * 60 * 24,     // 24 hours
    retry: 2,
    refetchOnWindowFocus: false,
    networkMode: 'offlineFirst',
    enabled: !!queryKey[queryKey.length - 1],
    ...options,
  });
}
```

**Why a new hook instead of modifying `useDashboardFetch`?**
- `useDashboardFetch` is consumed by 46 other files.
- Modifying its signature would require updating all 46 callers simultaneously.
- Creating `useServerQuery` allows incremental migration screen-by-screen.
- Once all screens are migrated, `useDashboardFetch` can be deleted.

### Step 2: Create Dashboard Data Fetcher

**New function inside `LovableMstDashboard.tsx`** (or extracted to a service file):

```typescript
interface DashboardData {
  property: { name: string } | null;
  tickets: Ticket[];
  isCheckedIn: boolean;
}

async function fetchDashboardData(
  propertyId: string,
  userId: string | undefined,
  supabase: SupabaseClient
): Promise<DashboardData> {
  const [{ data: propData }, { data: ticketData }, { data: shiftData }] = await Promise.all([
    supabase.from('properties').select('name').eq('id', propertyId).maybeSingle(),
    supabase.from('tickets')
      .select(`*, assignee:users!assigned_to(id, full_name, email, user_photo_url), creator:users!raised_by(id, full_name)`)
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false }),
    supabase.from('resolver_stats').select('is_checked_in').eq('property_id', propertyId).eq('user_id', userId ?? '').maybeSingle(),
  ]);

  return {
    property: propData ?? null,
    tickets: (ticketData as Ticket[]) ?? [],
    isCheckedIn: !!(shiftData as any)?.is_checked_in,
  };
}
```

**Key changes from old `fetchData`:**
- Returns `DashboardData` instead of void
- No `setState` calls
- No `saveMstCache` calls
- Uses `Promise.all` for parallel fetching (performance gain)
- Error handling delegated to React Query (retry logic)

### Step 3: Replace Data State with Query Hook

**Remove from `LovableMstDashboard.tsx`:**

```typescript
// REMOVE these imports:
import { useAsyncStorageCache } from '@/hooks/useAsyncStorageCache';
import { useDashboardFetch } from '@/hooks/useDashboardFetch';

// REMOVE these state declarations:
const { cachedData: mstCache, hasCache: hasMstCache, saveCache: saveMstCache } = useAsyncStorageCache<...>(...);
const [property, setProperty] = useState<...>(...);
const [tickets, setTickets] = useState<Ticket[]>([]);
const [isCheckedIn, setIsCheckedIn] = useState(false);

// REMOVE fetchData useCallback:
const fetchData = useCallback(async () => { ... }, [...]);

// REMOVE useDashboardFetch:
const { refetch } = useDashboardFetch(...);

// REMOVE cache save effect:
useEffect(() => { saveMstCache(...); }, [...]);

// REMOVE guaranteed fetch effect (no longer needed):
useEffect(() => { if (propertyId && isLoading) fetchData(); }, [propertyId]);
```

**Add to `LovableMstDashboard.tsx`:**

```typescript
// NEW import:
import { useServerQuery } from '@/hooks/useServerQuery';

// NEW query hook:
const {
  data,
  isLoading,
  isFetching,
  refetch,
  error,
} = useServerQuery<DashboardData>(
  queryKeys.property.mstDashboard(propertyId),
  () => fetchDashboardData(propertyId, user?.id, supabase),
  { staleTime: 1000 * 60 * 5 }
);

// Derive values from query data:
const property = data?.property ?? null;
const tickets = data?.tickets ?? [];
const isCheckedIn = data?.isCheckedIn ?? false;
```

### Step 4: Update Loading Logic

**Before:**
```typescript
const [isLoading, setIsLoading] = useState(!hasMstCache);

if (isLoading) {
  return <LoadingScreen />;
}
```

**After:**
```typescript
// isLoading comes from useServerQuery — true ONLY when no cache exists
if (isLoading) {
  return <LoadingScreen />;
}

// At this point, data is guaranteed to exist (from cache or fresh fetch)
```

### Step 5: Update Refresh Control

**Before:**
```typescript
const onRefresh = () => {
  setIsRefreshing(true);
  refetch();
};
```

**After:**
```typescript
const onRefresh = () => {
  refetch();
};

// In JSX:
<RefreshControl refreshing={isFetching} onRefresh={onRefresh} ... />
```

**Why `isFetching` instead of `isRefreshing` state?**
- React Query's `isFetching` is `true` during any background refetch.
- No need for a separate `isRefreshing` local state.
- `isFetching` is automatically managed by React Query.

### Step 6: Update Shift Toggle for Optimistic Cache Update

**Before:**
```typescript
const toggleShift = useCallback(async () => {
  if (!user?.id || !propertyId || isCheckingInOut) return;
  setIsCheckingInOut(true);
  const newStatus = !isCheckedIn;
  try {
    // ... DB update ...
    setIsCheckedIn(newStatus);
  } finally {
    setIsCheckingInOut(false);
  }
}, [isCheckedIn, propertyId, user?.id, isCheckingInOut]);
```

**After:**
```typescript
import { queryClient } from '@/utils/queryClient';

const toggleShift = useCallback(async () => {
  if (!user?.id || !propertyId || isCheckingInOut) return;
  setIsCheckingInOut(true);
  const newStatus = !isCheckedIn;
  try {
    // Optimistically update React Query cache
    queryClient.setQueryData<DashboardData>(
      queryKeys.property.mstDashboard(propertyId),
      (old) => old ? { ...old, isCheckedIn: newStatus } : old
    );
    
    // DB update
    await supabase.from('resolver_stats').upsert({
      property_id: propertyId,
      user_id: user.id,
      is_checked_in: newStatus,
    });
  } catch (err) {
    // Revert on error — invalidate to refetch true state
    queryClient.invalidateQueries({ queryKey: queryKeys.property.mstDashboard(propertyId) });
  } finally {
    setIsCheckingInOut(false);
  }
}, [isCheckedIn, propertyId, user?.id, isCheckingInOut]);
```

### Step 7: Update Stats and Filtered Data

**Before:**
```typescript
const stats = useMemo(() => {
  const total = tickets.length;
  const open = tickets.filter(...).length;
  const closed = tickets.filter(...).length;
  return { total, open, closed };
}, [tickets]);
```

**After:** (No change needed — `tickets` still exists, just sourced from `data.tickets`)
```typescript
const stats = useMemo(() => {
  const total = tickets.length;
  const open = tickets.filter((t) => ['open', 'in_progress', 'assigned'].includes(t.status)).length;
  const closed = tickets.filter((t) => ['resolved', 'closed', 'pending_validation'].includes(t.status)).length;
  return { total, open, closed };
}, [tickets]);
```

All `useMemo` computations remain unchanged. They simply consume `tickets` which now comes from `data?.tickets ?? []`.

### Step 8: Remove AsyncStorage Cache

The `useAsyncStorageCache` hook and its usage are entirely removed from `LovableMstDashboard.tsx`.

**Why?** React Query + MMKV persister now handles caching:
- MMKV persists the actual `DashboardData` object.
- On app restart, `PersistQueryClientProvider` restores the cache.
- `useServerQuery` reads from restored cache on first render.
- A second cache layer (AsyncStorage) is redundant and was the source of the bug.

### Step 9: Verify No Other Files Broken

Run a quick validation:
```bash
cd saas_mobile_app
grep -r "useDashboardFetch" components/dashboard/LovableMstDashboard.tsx
# Expected: zero results (replaced with useServerQuery)

grep -r "useDashboardFetch" --include="*.tsx" --include="*.ts" .
# Expected: 46 results in OTHER files (unchanged)
```

---

## 4. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **MMKV restore delay** | Low | Medium | `PersistQueryClientProvider` handles async restore. `useQuery` shows `isLoading: true` during restore, then reads cache. If cache exists, render is instant after restore completes (typically < 100ms). |
| **Query key collision** | Low | High | Query key `['mst-dashboard', propertyId]` is unchanged. No collision risk. |
| **Type mismatch in cache** | Low | Medium | If cached data structure changes (e.g., adding a field), old MMKV cache may have stale shape. React Query's `gcTime: 24hr` limits exposure. For safety, we can add a `select` transformer or version the query key. |
| **Optimistic update rollback** | Low | Low | If shift toggle fails, `invalidateQueries` triggers a refetch. User sees brief flicker as cache reverts. Acceptable for Phase 1. |
| **Memory pressure from large ticket lists** | Medium | Low | React Query caches all fetched data in memory. For properties with thousands of tickets, this could increase memory usage. Mitigation: pagination or `select` to trim data. |
| **Build/Bundling error** | Low | High | Adding `@tanstack/react-query` type imports could cause TypeScript issues. Mitigation: type-only import `import type { ... }`. |

---

## 5. Rollback Strategy

### Option A: Git Revert (Recommended)
```bash
git checkout -- saas_mobile_app/hooks/useDashboardFetch.ts
git checkout -- saas_mobile_app/components/dashboard/LovableMstDashboard.tsx
rm saas_mobile_app/hooks/useServerQuery.ts
```

### Option B: File Restore from Backup
```bash
cp saas_mobile_app/hooks/useDashboardFetch.ts.bak saas_mobile_app/hooks/useDashboardFetch.ts
cp saas_mobile_app/components/dashboard/LovableMstDashboard.tsx.bak saas_mobile_app/components/dashboard/LovableMstDashboard.tsx
rm saas_mobile_app/hooks/useServerQuery.ts
```

### Rollback Triggers
- Infinite loading persists after migration
- Crash on dashboard open
- Data not appearing after navigation back
- TypeScript build failures

**Rollback time:** < 2 minutes.

---

## 6. Before/After Data Flow

### Before (Broken)

```
Mount
  │
  ▼
useState('isLoading') = !hasMstCache ──→ true (AsyncStorage not loaded yet)
  │
  ▼
useAsyncStorageCache loads from AsyncStorage (async)
  │
  ▼
useDashboardFetch.useQuery runs
  │
  ├── Cache empty? ──→ run queryFn ──→ fetchData() ──→ setState() ──→ render ✅
  │
  └── Cache has timestamp (< 5 min)? ──→ SKIP queryFn ──→ fetchData() NEVER runs
                                              │
                                              ▼
                                         setIsLoading(false) NEVER called
                                              │
                                              ▼
                                         INFINITE SPINNER 🔴

Navigate Away
  │
  ▼
Component unmounts ──→ ALL local state LOST
  │
  ▼
Navigate Back
  │
  ▼
Remount ──→ repeat from top ──→ 50% chance of infinite spinner
```

### After (Fixed)

```
Cold Start
  │
  ▼
PersistQueryClientProvider restores MMKV cache (async, < 100ms)
  │
  ▼
LovableMstDashboard mounts
  │
  ▼
useServerQuery runs
  │
  ├── MMKV cache restored with data? ──→ return cached data instantly ──→ render ✅
  │                                         │
  │                                         ▼
  │                                    isFetching = true (background refetch)
  │                                         │
  │                                         ▼
  │                                    fetchDashboardData() runs silently
  │                                         │
  │                                         ▼
  │                                    Cache updated with fresh data
  │                                         │
  │                                         ▼
  │                                    UI re-renders only if data changed
  │
  └── MMKV cache empty? ──→ isLoading = true ──→ fetchDashboardData() ──→ render ✅

Navigate to Tickets
  │
  ▼
Component unmounts ──→ local UI state lost, but React Query cache PERSISTS in MMKV
  │
  ▼
Navigate Back
  │
  ▼
Remount ──→ useServerQuery reads from MMKV cache instantly ──→ render in < 16ms ✅
  │
  ▼
Background refetch runs if data is stale (> 5 min old)
```

---

## 7. Expected Performance Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Time to first render (cached)** | 1-3 seconds | < 100 ms | **10-30x faster** |
| **Time to first render (cold)** | 1-3 seconds | 1-3 seconds | No regression |
| **Perceived load on navigation back** | Full spinner | Instant | **Eliminated** |
| **Network requests on navigation back** | Always refetches | Only if stale | **Reduced** |
| **Memory cache hits** | 0% (timestamps only) | 100% (actual data) | **Complete** |
| **Infinite loading risk** | High (cache hit suppresses fetch) | Zero (cache hit returns data) | **Eliminated** |
| **Code complexity** | 3 cache systems | 1 cache system | **Simplified** |

### User Experience Improvement

```
BEFORE:
[User taps Dashboard tab] → [Spinner 2 seconds] → [Dashboard appears]
                        → [Taps Tickets]      → [Taps Back] 
                        → [Spinner 2 seconds] → [Dashboard appears]

AFTER:
[User taps Dashboard tab] → [Spinner 2 seconds] → [Dashboard appears]
                        → [Taps Tickets]      → [Taps Back]
                        → [Dashboard INSTANT] → [Subtle refresh indicator]
```

---

## 8. Success Criteria

### Automated Benchmarks

1. **Navigation Back Test**
   ```typescript
   // Pseudocode for manual benchmark
   const start = performance.now();
   router.back(); // From tickets to dashboard
   await waitFor(() => screen.queryByText('Loading dashboard...') === null);
   const elapsed = performance.now() - start;
   assert(elapsed < 200); // Must render in < 200ms
   ```

2. **No Infinite Loading Test**
   ```typescript
   // Navigate to dashboard, wait for fetch
   // Navigate to tickets
   // Wait 30 seconds (within staleTime)
   // Navigate back
   // Assert: no spinner visible after 500ms
   ```

3. **Cache Persistence Test**
   ```typescript
   // Load dashboard
   // Kill app
   // Reopen app
   // Assert: dashboard renders instantly from cache
   ```

### Manual Checklist

- [ ] Dashboard loads on first visit
- [ ] Navigate to Tickets → navigate back → Dashboard renders instantly
- [ ] Pull-to-refresh shows indicator and updates data
- [ ] Shift toggle updates check-in status immediately
- [ ] Kill app → reopen → Dashboard renders from cache (no spinner)
- [ ] No TypeScript errors
- [ ] No Metro bundling errors
- [ ] No console warnings about missing dependencies

---

## 9. Phase 2+ Preview (Out of Scope)

Once Phase 1 is validated on MST Dashboard:

1. **Phase 2:** Migrate `LovableStaffDashboard.tsx` (also has `useAsyncStorageCache`)
2. **Phase 3:** Migrate `LovablePropertyAdminDashboard.tsx` (has Zustand store — remove dual cache)
3. **Phase 4:** Migrate high-traffic screens: Tickets, Visitors, Stock
4. **Phase 5:** Migrate remaining screens one-by-one
5. **Phase 6:** Delete `useDashboardFetch.ts` and `useAsyncStorageCache.ts` (no longer needed)
6. **Phase 7:** Add `useFocusEffect` for automatic background refresh on navigation back

---

## 10. Files Modified in Phase 1

| File | Action | Lines Changed |
|------|--------|---------------|
| `hooks/useServerQuery.ts` | **Created** | ~30 lines |
| `components/dashboard/LovableMstDashboard.tsx` | **Modified** | ~80 lines removed, ~20 lines added |
| `utils/queryKeys.ts` | Unchanged | — |
| `utils/queryClient.ts` | Unchanged | — |
| `app/_layout.tsx` | Unchanged | — |

**All other 46 files:** Completely untouched.

---

## Approval Checklist

Before implementation begins, confirm:

- [ ] Plan reviewed and approved
- [ ] Rollback strategy understood
- [ ] Success criteria agreed upon
- [ ] Phase 1 scope limited to `useServerQuery` + `LovableMstDashboard`
- [ ] No other files will be modified
