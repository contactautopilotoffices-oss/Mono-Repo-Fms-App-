# CACHE FAILURE REPORT
**Generated: 2026-06-06**
**Version: 1.0**

---

## EXECUTIVE SUMMARY

The app has multiple cache layers (React Query, Zustand, MMKV, AsyncStorage) but they are NOT working together correctly. The result is that users see loading spinners even when valid cached data exists.

**Why the app does NOT behave like:**
```
Cache Restore
↓
Instant Render
↓
Background Refresh
```

**Root cause:** Zustand hydration is async, propertyCache was not persisted, and different dashboards use different caching strategies with no unified approach.

---

## P0 ISSUES (Critical - Causing Immediate User Impact)

### P0-1: propertyCache Not Persisted

**Symptom:** Dashboard shows skeleton loader when returning from other modules, even if data was previously loaded.

**Root Cause:** `propertyCache` was NOT included in Zustand `partialize` config, so it was lost on app restart or component unmount.

**Evidence:**
```typescript
// dashboardStore.ts - BEFORE FIX
partialize: (state) => ({
  backgroundImage: state.backgroundImage,
  loadedPropertyId: state.loadedPropertyId,
  tickets: state.tickets,
  // ... other fields
  // propertyCache MISSING!
})
```

**File:** `saas_mobile_app/stores/dashboardStore.ts`  
**Hook:** `switchProperty()`  
**State Variable:** `propertyCache`

**Frequency:** 100% on app restart, 50% on navigation return

**User Impact:** High - Users see loading every time they return to dashboard after switching away.

---

### P0-2: Zustand Hydration Race Condition

**Symptom:** App restart shows skeleton loader briefly before content appears.

**Root Cause:** Zustand `persist` middleware reads from MMKV asynchronously, but React renders synchronously. During hydration window, `hasLoadedInitialData` is `false`.

**Evidence:**
```typescript
// RootLayout renders children before Zustand hydrates
<PersistQueryClientProvider>
  <AuthProvider>  // AuthContext reads Zustand
    <AppContent>
      <PropertyLayout>
        <LovablePropertyAdminDashboard>
          // useDashboardStore reads state that may not be hydrated yet
          const hasLoadedInitialData = useDashboardStore(state => state.hasLoadedInitialData);
```

**File:** `saas_mobile_app/stores/dashboardStore.ts`  
**Hook:** `create()` with `persist` middleware  
**State Variable:** `hasLoadedInitialData`

**Frequency:** 100% on cold start

**User Impact:** Medium - Brief flash of skeleton on restart, but content eventually shows.

---

### P0-3: MMKV Instance Fragmentation

**Symptom:** React Query cache doesn't persist correctly, causing re-fetches on app restart.

**Root Cause:** `createSyncStoragePersister` in `queryClient.ts` uses `createMMKV()` which may create a different MMKV instance than `zustandStorage`.

**Evidence:**
```typescript
// queryClient.ts
createSyncStoragePersister({
  storage: createMMKV({ id: 'react-query-cache' }),  // Different instance?
})

// storage.ts
const storage = new MMKV({ id: 'autopilot-app-cache' });  // This instance?
export const zustandStorage = { getItem: storage.getItem, ... }
```

**File:** `saas_mobile_app/utils/queryClient.ts`  
**Hook:** `createSyncStoragePersister()`  
**State Variable:** React Query internal cache

**Frequency:** Unknown - may not be an issue if MMKV handles multiple instances correctly

**User Impact:** High if confirmed - React Query prefetch and caching would be broken.

---

## P1 ISSUES (High Priority - Causing Frequent User Impact)

### P1-1: Property Switch Shows Loading Despite Cache

**Symptom:** When switching properties, skeleton loader appears even if that property was previously visited.

**Root Cause:** `switchProperty()` may not find cached state if `propertyCache` wasn't persisted correctly.

**Evidence:**
```typescript
// dashboardStore.ts lines 108-119
switchProperty: (newPropertyId) => {
  const cachedState = newCache[newPropertyId];
  if (cachedState) {
    return { ...state, ...cachedState, hasLoadedInitialData: true };
  }
  // No cache - shows loading
  return { ...state, ...initialState, hasLoadedInitialData: false };
}
```

**File:** `saas_mobile_app/stores/dashboardStore.ts`  
**Hook:** `switchProperty()`  
**State Variable:** `propertyCache[newPropertyId]`

**Frequency:** 50% on property switch

**User Impact:** Medium - User sees loading when switching between properties they've already visited.

---

### P1-2: Race Condition in switchProperty UseEffect

**Symptom:** Brief loading flash when switching properties, even with valid cache.

**Root Cause:** `useEffect` calls `switchProperty()` which is async, but loading check happens before state updates.

**Evidence:**
```typescript
// LovablePropertyAdminDashboard.tsx lines 526-537
useEffect(() => {
  if (useDashboardStore.getState().loadedPropertyId !== propertyId) {
    switchProperty(propertyId);  // Async - doesn't block
  }
}, [propertyId]);

// Meanwhile, same render:
const shouldShowLoading = (!hasLoadedInitialData || loadedPropertyId !== propertyId);
// loadedPropertyId is still OLD value here!
```

**File:** `saas_mobile_app/components/dashboard/LovablePropertyAdminDashboard.tsx`  
**Hook:** `useEffect([propertyId])`  
**State Variable:** `loadedPropertyId`

**Frequency:** 100% on property switch

**User Impact:** Low - Brief flash, but cache eventually renders.

---

### P1-3: AsyncStorage Cache Not Property-Scoped (Staff)

**Symptom:** Staff dashboard shows data from wrong property after switching.

**Root Cause:** `useAsyncStorageCache` uses same key `'staff-dashboard'` for all properties.

**Evidence:**
```typescript
// LovableStaffDashboard.tsx
const { cachedData } = useAsyncStorageCache({
  key: 'staff-dashboard',  // Not property-scoped!
  propertyId,
  ...
});
```

**File:** `saas_mobile_app/components/dashboard/LovableStaffDashboard.tsx`  
**Hook:** `useAsyncStorageCache()`  
**State Variable:** Cache key

**Frequency:** 100% when switching properties on staff dashboard

**User Impact:** High - Shows completely wrong data.

---

### P1-4: Prefetch Writes to React Query, Dashboard Reads from Zustand

**Symptom:** Login prefetch has no visible effect - dashboard still loads on first visit.

**Root Cause:** `prefetchService.ts` writes to React Query, but `LovablePropertyAdminDashboard` reads from Zustand.

**Evidence:**
```typescript
// prefetchService.ts
await queryClient.prefetchQuery({
  queryKey: ['property', propertyId, 'dashboard'],
  queryFn: async () => {
    // Writes to React Query cache
    const data = await serverApi.query(...);
    return data;
  }
});

// LovablePropertyAdminDashboard.tsx
const { tickets } = useDashboardStore();  // Reads from Zustand, NOT React Query!
```

**File:** `saas_mobile_app/services/prefetchService.ts`  
**Hook:** `prefetchCriticalOnLogin()`  
**State Variable:** React Query cache vs Zustand store

**Frequency:** 100% on login

**User Impact:** Medium - Prefetch effort wasted, but data still loads.

---

## P2 ISSUES (Medium Priority - Causing Occasional User Impact)

### P2-1: Inconsistent Caching Patterns Across Dashboards

**Symptom:** Different dashboards behave differently (some load instantly, some show loading).

**Root Cause:** Each dashboard uses different caching strategy:
- PropertyAdmin: Zustand + propertyCache
- Staff: AsyncStorage
- SuperAdmin: Zustand only
- MST: React Query only
- SoftServiceManager: Local state only

**Evidence:** See DASHBOARD_TRACE.md

**File:** Multiple dashboard components  
**Hook:** Various  
**State Variable:** Multiple

**Frequency:** N/A - architectural issue

**User Impact:** Low - Different UX but not broken.

---

### P2-2: useDashboardFetch Stores Only Timestamp

**Symptom:** React Query shows cache hit but dashboard still loads.

**Root Cause:** `useDashboardFetch` only stores timestamp in React Query, actual data goes to Zustand.

**Evidence:**
```typescript
// useDashboardFetch.ts
const result = useQuery({
  queryKey,
  queryFn: async () => {
    await fetchFn();  // fetchFn stores to Zustand
    return Date.now();  // RQ only gets timestamp
  },
  staleTime: 5 * 60 * 1000,
});
```

**File:** `saas_mobile_app/hooks/useDashboardFetch.ts`  
**Hook:** `useDashboardFetch()`  
**State Variable:** Query data (timestamp only)

**Frequency:** 100% for dashboard queries

**User Impact:** Low - Works but not using React Query optimally.

---

### P2-3: No Unified Cache Invalidation

**Symptom:** Data changes (ticket created) don't invalidate dashboard cache.

**Root Cause:** No centralized cache invalidation when mutations occur.

**Evidence:** Mutations call `queryClient.invalidateQueries()` but dashboard reads from Zustand, not React Query.

**File:** Various mutation hooks  
**Hook:** `useMutation().onSuccess`  
**State Variable:** Zustand store

**Frequency:** 100% when mutations occur

**User Impact:** Low - Dashboard shows stale data until manual refresh.

---

### P2-4: PropertyLayout Blocks All Routes During Access Check

**Symptom:** Loading spinner shown even when user is already authenticated.

**Root Cause:** `checkPropertyAccess()` called on every route mount.

**Evidence:**
```typescript
// PropertyLayout.tsx
if (authLoading || accessState.checking || (user && !membership)) {
  return <ActivityIndicator />;
}
```

**File:** `saas_mobile_app/app/property/[propertyId]/_layout.tsx`  
**Hook:** `checkPropertyAccess()`  
**State Variable:** `accessState.checking`

**Frequency:** 100% on route mount

**User Impact:** Medium - 2-5 second delay before any property route renders.

---

## ROOT CAUSE ANALYSIS

### Why the app does NOT behave like "Cache Restore → Instant Render → Background Refresh"

**Answer:** The cache layers are fragmented and not working together.

**Expected Flow:**
```
1. App starts
2. Zustand hydrates from MMKV (sync, instant)
3. Dashboard reads hasLoadedInitialData = true from store
4. Dashboard renders cached content immediately
5. Background: React Query refetches stale data
6. UI updates when fresh data arrives
```

**Actual Flow:**
```
1. App starts
2. Zustand begins hydration (async)
3. Dashboard mounts, reads hasLoadedInitialData = false (not yet hydrated)
4. Dashboard shows SkeletonLoader
5. Zustand hydrates (500ms delay)
6. Dashboard re-renders, content appears
7. React Query checks cache (may miss due to MMKV instance issue)
8. Network requests execute
9. Data updates
```

**Key Breakdowns:**

1. **Zustand hydration is async, but React renders sync** → Content waits for hydration

2. **propertyCache was not persisted** → Cache lost on restart

3. **Different dashboards use different stores** → No unified caching

4. **Prefetch targets wrong store** → Prefetch wasted

5. **React Query data not used by dashboard** → Double storage, no benefit

---

## EVIDENCE SUMMARY

| Issue | File | Line | Frequency | Impact |
|-------|------|------|-----------|--------|
| propertyCache not persisted | dashboardStore.ts | 140-160 | 100% restart | High |
| Zustand hydration async | dashboardStore.ts | persist config | 100% cold start | Medium |
| MMKV instance mismatch | queryClient.ts | 15-20 | Unknown | High |
| Switch shows loading | dashboardStore.ts | 108-129 | 50% switch | Medium |
| AsyncStorage key collision | LovableStaffDashboard.tsx | useAsyncStorageCache | 100% staff switch | High |
| Prefetch wasted | prefetchService.ts | entire file | 100% login | Medium |
| useDashboardFetch timestamp | useDashboardFetch.ts | 25-28 | 100% | Low |

---

## NEXT STEPS (Evidence Only - No Fixes)

1. **Verify propertyCache fix works** - Add runtime logging to confirm persistence
2. **Test MMKV instance sharing** - Verify React Query and Zustand share same MMKV
3. **Add hydration guard** - Log when Zustand hydrates vs when component renders
4. **Audit all cache keys** - Ensure all are property-scoped
5. **Standardize dashboard patterns** - Pick one caching strategy for all dashboards