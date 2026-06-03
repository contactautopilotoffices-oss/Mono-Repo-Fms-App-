# Dashboard Cache Failure Report

**Date:** 2026-06-02
**Scope:** `saas_mobile_app` — MST Dashboard (`LovableMstDashboard.tsx`)
**Severity:** HIGH — Blocks user experience on every navigation cycle

---

## Executive Summary

The dashboard exhibits infinite loading and cache-ignored behavior because of a **fundamental architectural mismatch** between React Query (MMKV-persisted) and a custom AsyncStorage cache. The dashboard uses React Query as a "fetch scheduler" rather than as a data cache, and maintains its own local `useState` for all data. When React Query decides a cached query is fresh and skips the `queryFn`, the dashboard's local `isLoading` state never becomes `false`, resulting in an infinite spinner.

---

## Phase 1 — Dashboard Lifecycle Trace

### Mount / Unmount Behavior

| Event | Evidence |
|-------|----------|
| **Dashboard Mount** | `dashboard/index.tsx` renders `LovableMstDashboard` component |
| **Dashboard Unmount** | Expo Router `Slot` unmounts children when route changes |
| **Dashboard Remount** | Returning via `router.back()` or bottom-nav remounts the component |
| **useFocusEffect** | **ZERO instances** in the entire codebase |
| **Navigation listeners** | **NONE** — no `focus`, `blur`, or `beforeRemove` listeners |

### Key Code Paths

```tsx
// app/property/[propertyId]/dashboard/index.tsx (lines 87-88)
if (effectiveRole === 'mst') {
  return <LovableMstDashboard propertyId={pid} />;
}
```

```tsx
// app/property/[propertyId]/_layout.tsx (lines 542-595)
// Uses <Slot /> — NOT <Stack />. Children unmount on navigation away.
<PropertyContext.Provider value={propertyInfo}>
  <View style={{ flex: 1 }}>
    <Slot />
    <GlobalBottomNav />
  </View>
</PropertyContext.Provider>
```

### Verdict

**Dashboard DOES remount on navigation back.** There is no focus-based refresh mechanism. Cache MUST survive across unmount/remount cycles, or the user sees a full reload every time.

---

## Phase 2 — Query Analysis

### Dashboard Query Configuration

```tsx
// hooks/useDashboardFetch.ts (lines 16-36)
export function useDashboardFetch(
  queryKey: readonly string[],
  fetchFn: () => Promise<void>,
  options?: { staleTime?: number; enabled?: boolean }
) {
  const { staleTime = 1000 * 60 * 5, enabled = true } = options ?? {};

  const result = useQuery({
    queryKey,
    queryFn: async () => {
      await fetchFn();
      return Date.now();
    },
    staleTime,
    enabled: enabled && !!queryKey[queryKey.length - 1],
    refetchOnWindowFocus: false,
    retry: 2,
  });

  return result;
}
```

### How the Dashboard Uses It

```tsx
// LovableMstDashboard.tsx (lines 576-578)
const { refetch } = useDashboardFetch(
  queryKeys.property.mstDashboard(propertyId),
  fetchData,
  { staleTime: 1000 * 60 * 5 }
);
```

| Property | Value |
|----------|-------|
| **Query Key** | `['mst-dashboard', propertyId]` |
| **Stale Time** | 5 minutes |
| **GC Time** | 24 hours (global default) |
| **Enabled** | `true && !!propertyId` |
| **queryFn Return** | `Date.now()` (a timestamp, NOT data) |
| **Cache Status** | Persisted to MMKV via `PersistQueryClientProvider` |

### Critical Finding

The `queryFn` does **NOT return dashboard data**. It calls `fetchData()` (which writes to local `useState`) and returns `Date.now()`. React Query's cache stores **only a timestamp**, never the actual tickets, property, or shift status.

**Cache Hit Occurring?** `YES` — but it is useless. A cache hit returns `Date.now()` from a previous fetch and **skips calling `fetchData()`**. The dashboard's local state remains empty, and `isLoading` stays `true`.

---

## Phase 3 — Query Key Stability

| Key Component | Type | Stability |
|---------------|------|-----------|
| `'mst-dashboard'` | string literal | ✅ Stable |
| `propertyId` | string from URL | ✅ Stable |

```tsx
// utils/queryKeys.ts (line 80)
mstDashboard: (propertyId: string) => ['mst-dashboard', propertyId] as const,
```

**Verdict:** Query key is perfectly stable. No object references. This is NOT the source of the problem.

---

## Phase 4 — Cache Hydration Analysis

### Two Parallel, Uncoordinated Cache Systems

#### System A: React Query + MMKV Persister

```tsx
// app/_layout.tsx (lines 142-157)
<PersistQueryClientProvider
  client={queryClient}
  persistOptions={{ persister: mmkvPersister }}
>
```

```tsx
// utils/queryClient.ts (lines 33-52)
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60 * 24,
      retry: 2,
      refetchOnWindowFocus: false,
      networkMode: 'offlineFirst',
    },
  },
});
```

**What it stores:** `Date.now()` timestamps (from `useDashboardFetch`).
**What it does NOT store:** tickets, property name, shift status.

#### System B: Custom AsyncStorage Cache

```tsx
// LovableMstDashboard.tsx (lines 465-470)
const { cachedData: mstCache, hasCache: hasMstCache, saveCache: saveMstCache } =
  useAsyncStorageCache<{
    property: { name: string } | null;
    tickets: Ticket[];
    isCheckedIn: boolean;
  }>({ key: 'mst-dashboard', propertyId, staleTime: 5 * 60 * 1000 });
```

**What it stores:** `{ property, tickets, isCheckedIn }`.
**What it does:** Loads from AsyncStorage on mount. Saves after `fetchData` completes.

### Hydration Timeline

```
App Launch
    │
    ▼
PersistQueryClientProvider restores React Query cache from MMKV
    │
    ▼
User navigates to Dashboard
    │
    ▼
LovableMstDashboard mounts
    │
    ├── useState('isLoading') = !hasMstCache      ← local AsyncStorage check
    │
    ├── useAsyncStorageCache loads from AsyncStorage
    │
    ├── useDashboardFetch.useQuery runs
    │       ├── React Query cache has ['mst-dashboard', <pid>]?
    │       ├── YES → data is fresh (< 5 min)?
    │       │       ├── YES → SKIP queryFn entirely
    │       │       │       └── fetchData() NEVER runs
    │       │       └── NO  → run queryFn → fetchData() → setIsLoading(false)
    │       └── NO  → run queryFn → fetchData() → setIsLoading(false)
    │
    └── If fetchData() never runs → isLoading stays TRUE → INFINITE SPINNER
```

### Verdict

**Cache hydration IS working** (MMKV restores, AsyncStorage loads). **But the dashboard does not render from either cache.** It only uses `hasMstCache` to decide the initial `isLoading` value, then waits for `fetchData()` to populate local state. If React Query suppresses the fetch, the cached data is ignored.

---

## Phase 5 — Loading State Analysis

### Dashboard Loading Logic

```tsx
// LovableMstDashboard.tsx (lines 472-474)
const [isLoading, setIsLoading] = useState(!hasMstCache);
```

```tsx
// LovableMstDashboard.tsx (lines 948-959)
if (isLoading) {
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />
      <DashboardBackground />
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    </View>
  );
}
```

### The Problem

| Condition | Current Behavior | Expected Behavior |
|-----------|-----------------|-------------------|
| AsyncStorage cache exists | `isLoading = false`, but `tickets` state is still `[]` until `fetchData` runs | Render from cache instantly, background refresh |
| AsyncStorage cache missing | `isLoading = true` | Show spinner |
| React Query cache fresh | `useQuery` skips `queryFn` → `fetchData` never runs → `isLoading` stays `true` | Should NOT block on React Query cache freshness |
| React Query cache stale/missing | `useQuery` runs `queryFn` → `fetchData` runs → `isLoading = false` | Works correctly |

### The `fetchData` Function

```tsx
// LovableMstDashboard.tsx (lines 515-567)
const fetchData = useCallback(async () => {
  if (!propertyId) return;
  try {
    // ... Supabase queries ...
  } catch (err) {
    console.warn('[LovableMstDashboard] fetch error:', err);
  } finally {
    setIsLoading(false);      ← ONLY place isLoading becomes false
    setIsRefreshing(false);
  }
}, [propertyId, user?.id, saveMstCache]);
```

**Critical:** `fetchData` is the **sole place** where `isLoading` becomes `false`. If `fetchData` is never invoked, the spinner spins forever.

### React Query State vs Dashboard State

| State | Source | Used in UI? |
|-------|--------|-------------|
| `isLoading` (local) | `useState(!hasMstCache)` | ✅ Controls full-screen spinner |
| `result.isLoading` (RQ) | `useQuery` | ❌ Ignored — only `refetch` is destructured |
| `result.isFetching` (RQ) | `useQuery` | ❌ Ignored |
| `result.data` (RQ) | `useQuery` — stores `Date.now()` | ❌ Ignored |
| `mstCache` (AsyncStorage) | `useAsyncStorageCache` | ❌ Used only for `hasMstCache` |
| `tickets` (local) | `useState` — set by `fetchData` | ✅ Rendered in UI |
| `property` (local) | `useState` — set by `fetchData` | ✅ Rendered in UI |

---

## Phase 6 — Invalidation Analysis

### Findings

| Operation | Count | Locations |
|-----------|-------|-----------|
| `invalidateQueries` | **0** | None in production code |
| `removeQueries` | **0** | None in production code |
| `resetQueries` | **0** | None in production code |
| `queryClient.clear()` | **0** | None in production code |

```tsx
// context/AuthContext.tsx (lines 400-406)
const signOut = useCallback(async () => {
  if (user?.id) {
    await clearMembershipCache(user.id);   // ← Only clears AsyncStorage membership
  }
  setMembership(null);
  await supabase.auth.signOut();
  // ❌ queryClient.clear() is NOT called
  // ❌ MMKV React Query cache survives sign-out
}, [supabase, user?.id]);
```

### Implications

1. **Cross-user data leakage risk:** If User A signs out and User B signs in on the same device, React Query's MMKV cache still contains User A's `['mst-dashboard', propertyId]` timestamp. This doesn't leak data directly (because the cache only stores timestamps), but it does affect fetch behavior.
2. **No proactive cache invalidation:** After creating a ticket, the dashboard cache is not invalidated. The user must wait 5 minutes or pull-to-refresh to see new data.
3. **Cache bloat:** Over time, MMKV accumulates query keys for every property visited. No cleanup mechanism exists.

---

## Phase 7 — Property Context Analysis

### Auth → Property → Dashboard Flow

```
AuthContext (global)
    ├── user: AuthUser | null
    ├── membership: UserMembership | null
    ├── isLoading: boolean
    └── isMembershipLoading: boolean
        │
        ▼
PropertyLayout (_layout.tsx)
    ├── Runs checkPropertyAccess(propertyId, user) on mount
    ├── Falls back to membership.properties if API fails
    ├── Sets accessState: { authorized, role, checking }
    ├── Shows spinner while: authLoading || accessState.checking || (user && !membership)
    └── Renders <Slot /> with <PropertyContext.Provider>
        │
        ▼
DashboardScreen (dashboard/index.tsx)
    ├── Computes effectiveRole from membership
    ├── Shows SkeletonLoader while: isMembershipLoading || !membership
    └── Renders role-specific dashboard component
        │
        ▼
LovableMstDashboard
    ├── Initializes local state from mstCache (AsyncStorage)
    ├── Registers useQuery via useDashboardFetch
    └── Renders based on local isLoading state
```

### Stability Analysis

| Variable | Source | Changes on remount? |
|----------|--------|---------------------|
| `propertyId` | `useLocalSearchParams` | No — stable string |
| `membership` | AuthContext | No — cached in AsyncStorage |
| `user` | AuthContext | No — Supabase session persists |
| `accessState` | Local useState in PropertyLayout | **Yes** — resets to `{ checking: true }` on remount |

### Key Observation

`PropertyLayout` resets `accessState` to `{ checking: true }` on every mount. This causes the layout to show its own spinner (`ActivityIndicator`) briefly on every navigation back, before rendering the dashboard. This is a **second loading state** layered on top of the dashboard's loading state.

---

## Phase 8 — Navigation Analysis

### Navigation Patterns

| Pattern | Status | Impact |
|---------|--------|--------|
| `useFocusEffect` | ❌ Not used anywhere | No automatic refresh on navigation back |
| Navigation event listeners | ❌ None | No `focus` / `blur` handling |
| `refetch()` on navigation | ❌ None | All `refetch()` calls are pull-to-refresh only |
| State reset on navigation | ❌ None explicit | But component unmount causes full state loss |
| `router.back()` from tickets | ✅ Used | Returns to dashboard, but dashboard remounts fresh |

### Bottom Navigation Behavior

```tsx
// components/shared/GlobalBottomNav.tsx (lines 57-108)
// Uses router.navigate() for tab switching
```

The bottom nav uses `router.navigate()`, which in Expo Router can reuse the route if it's already in the stack. However, because `PropertyLayout` uses `<Slot />` (not `<Stack />`), the entire subtree unmounts when switching between major routes.

### Verdict

Navigation **does not trigger any cache invalidation or refetch**. The problem is that navigation **triggers a full remount**, and the remounted dashboard fails to read from cache properly.

---

## Phase 9 — Infinite Loading Root Cause

### The Definitive Root Cause

**The dashboard maintains two independent cache systems that are not coordinated. React Query's cache hit suppresses the fetch that the dashboard requires to exit its loading state.**

### Step-by-Step Failure Chain

1. **User opens dashboard for the first time**
   - `hasMstCache = false` → `isLoading = true`
   - React Query has no cache for `['mst-dashboard', pid]`
   - `useQuery` runs `queryFn` → calls `fetchData()`
   - `fetchData()` fetches tickets, property, shift status
   - `fetchData()` sets `tickets`, `property`, `isCheckedIn` via `setState`
   - `fetchData()` finally calls `setIsLoading(false)`
   - `saveMstCache()` writes to AsyncStorage
   - Dashboard renders successfully ✅

2. **User navigates to Tickets**
   - Expo Router unmounts `LovableMstDashboard`
   - All local state is destroyed
   - React Query cache persists in MMKV (timestamp: `Date.now()`)
   - AsyncStorage cache persists (`{ property, tickets, isCheckedIn }`)

3. **User returns to Dashboard (the failure)**
   - `LovableMstDashboard` remounts
   - `hasMstCache = true` (AsyncStorage has data from step 1)
   - `isLoading = !hasMstCache = false` ← This seems OK
   - **BUT WAIT:** In the current code, `hasMstCache` is checked synchronously. The `useAsyncStorageCache` hook loads asynchronously. On the FIRST render, `hasMstCache` might still be `false` while loading.
   - Even if `hasMstCache = true`, `tickets` local state starts as `[]` (empty array)
   - `useDashboardFetch.useQuery` runs
   - React Query cache for `['mst-dashboard', pid]` exists (from step 1)
   - Data is fresh? (< 5 min since last visit?) → **YES**
   - `useQuery` returns cached `Date.now()` and **SKIPS `queryFn`**
   - `fetchData()` is **NEVER CALLED**
   - `tickets` stays `[]`, `property` stays `null`
   - If `hasMstCache` was `false` on first render (AsyncStorage not yet loaded), `isLoading = true` and never becomes `false`
   - **INFINITE LOADING** 🔴

### Secondary Cause: `fetchData` Early Return Without State Reset

```tsx
// LovableMstDashboard.tsx (line 516)
const fetchData = useCallback(async () => {
  if (!propertyId) return;   ← EARLY RETURN — bypasses finally block!
  try { ... }
  finally { setIsLoading(false); }
}, ...);
```

If `propertyId` is ever falsy during any render cycle, `fetchData` returns immediately **without reaching the `finally` block**. This is a secondary trapdoor into infinite loading.

### Tertiary Cause: No Render-from-Cache

Even when `mstCache` (AsyncStorage) contains valid data, the dashboard NEVER renders from it:

```tsx
// Current initialization
const [property, setProperty] = useState<{ name: string } | null>(mstCache?.property ?? null);
const [tickets, setTickets] = useState<Ticket[]>(mstCache?.tickets ?? []);
```

This looks like it uses the cache for initialization. But because `useAsyncStorageCache` loads asynchronously, `mstCache` is `null` on the **first render**. The `useState` initializers run with `null`. Then the effect loads cache data, but `useState` has already been initialized with empty values.

---

## Phase 10 — Industry Comparison

### Expected SaaS Pattern (Production-Grade)

```
User navigates to Dashboard
    │
    ▼
React Query cache restored from MMKV (instant)
    │
    ▼
useQuery returns cached data immediately
    │
    ▼
Dashboard renders from cache (0ms spinner time)
    │
    ▼
Background refetch starts (staleWhileRevalidate)
    │
    ▼
New data arrives → React Query updates cache → UI re-renders
    │
    ▼
User navigates away
    │
    ▼
User navigates back
    │
    ▼
Dashboard renders INSTANTLY from cache
    │
    ▼
Background refetch checks staleness → fetches if needed
```

### Current Pattern (Broken)

```
User navigates to Dashboard
    │
    ▼
Local isLoading = true (or false based on AsyncStorage race)
    │
    ▼
useQuery MAY or MAY NOT trigger fetchData()
    │
    ▼
If useQuery skips fetch → isLoading stays true → INFINITE SPINNER
    │
    ▼
If useQuery runs fetch → fetchData() sets local state → renders
    │
    ▼
User navigates away → all local state LOST
    │
    ▼
User navigates back → repeat from top
```

### Gap Analysis

| Dimension | Industry Standard | Current Implementation | Score |
|-----------|-------------------|------------------------|-------|
| **Cache Architecture** | Single source of truth (React Query) | Two uncached systems (RQ + AsyncStorage) | ❌ FAIL |
| **Hydration** | Render from cache before any fetch | Fetch before render; cache ignored for rendering | ❌ FAIL |
| **Navigation** | Cache survives navigation; background refresh | Full remount + refetch; no focus handling | ❌ FAIL |
| **Loading UX** | Show spinner ONLY when no cached data | Show spinner based on fetch completion | ❌ FAIL |
| **Performance** | 0ms perceived load time | 1-3s load time every navigation | ❌ FAIL |

---

## Files Responsible

| File | Role | Issue |
|------|------|-------|
| `components/dashboard/LovableMstDashboard.tsx` | Dashboard component | Uses local `useState` for all data; `isLoading` tied to `fetchData` completion; does not render from AsyncStorage cache |
| `hooks/useDashboardFetch.ts` | React Query wrapper | `queryFn` returns `Date.now()` instead of data; used only as fetch scheduler |
| `hooks/useAsyncStorageCache.ts` | AsyncStorage cache | Loads asynchronously (race condition with `useState` init); data loaded but never rendered from |
| `app/property/[propertyId]/_layout.tsx` | Property layout | Resets `accessState` on every mount; causes layout-level spinner on every navigation back |
| `context/AuthContext.tsx` | Auth provider | `signOut()` does not clear React Query cache (`queryClient.clear()`) |
| `utils/queryClient.ts` | Query client config | Default `staleTime: 5 min` is fine; persister config is fine |
| `app/_layout.tsx` | Root layout | Correctly wraps app in `PersistQueryClientProvider` |

---

## Industry-Grade Solution (Reference — Not Implemented)

1. **Eliminate dual cache systems.** Use React Query as the single source of truth. Store actual dashboard data in RQ cache, not just timestamps.
2. **Render from cache first.** Use `useQuery`'s `data` (or `cachedData`) for initial render. Never block UI on `isLoading` when cached data exists.
3. **Fix loading condition.** Show spinner only when `!data && isLoading` (no cache, first fetch).
4. **Add `useFocusEffect`.** On navigation back, call `refetch()` to refresh stale data in background.
5. **Clear cache on sign-out.** Call `queryClient.clear()` in `AuthContext.signOut()`.
6. **Invalidate on mutations.** After ticket create/update/delete, call `queryClient.invalidateQueries({ queryKey: ['mst-dashboard', propertyId] })`.
7. **Consider `staleTime: Infinity` for navigation.** Mark dashboard data as stale immediately on focus, but render from cache while refetching.

---

## Conclusion

The infinite loading is caused by a **design-level anti-pattern**: using React Query as a fetch scheduler while maintaining a parallel local state system. When React Query's cache decides the query is fresh (within 5 minutes), it suppresses the `queryFn` call. The dashboard's `fetchData()` never runs, so `setIsLoading(false)` is never called, and the user sees an infinite spinner.

The cached data (both MMKV and AsyncStorage) **exists** but is **never used for rendering**. This is not a configuration bug or a network issue — it is an architectural mismatch that prevents the dashboard from behaving like a production-grade cached application.
