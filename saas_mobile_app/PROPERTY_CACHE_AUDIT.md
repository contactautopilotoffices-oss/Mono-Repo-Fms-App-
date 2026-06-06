# PROPERTY CACHE AUDIT
**Generated: 2026-06-06**
**Version: 1.0**

---

## OVERVIEW

This audit traces what happens to each cache layer when switching between properties.

---

## PROPERTY SWITCH FLOW

### Current Implementation (LovablePropertyAdminDashboard)

**Step 1: User navigates to different property**
```
User on Property A dashboard
↓ tap property switcher
↓ select Property B
```

**Step 2: switchProperty() called**
```typescript
// dashboardStore.ts lines 98-129
switchProperty: (newPropertyId) => {
  // 1. Check if already on this property
  if (state.loadedPropertyId === newPropertyId) return state;
  
  // 2. Save current state to cache
  const newCache = { ...state.propertyCache };
  if (state.loadedPropertyId) {
    newCache[state.loadedPropertyId] = { ...state };
  }
  
  // 3. Try to load cached state for new property
  const cachedState = newCache[newPropertyId];
  if (cachedState) {
    return { ...state, ...cachedState, hasLoadedInitialData: true };
  }
  
  // 4. No cache - reset to initial state
  return { ...state, ...initialState, hasLoadedInitialData: false };
}
```

**Step 3: Dashboard re-renders**
```typescript
// LovablePropertyAdminDashboard.tsx lines 526-537
useEffect(() => {
  if (useDashboardStore.getState().loadedPropertyId !== propertyId) {
    switchProperty(propertyId);
  }
}, [propertyId]);
```

**Step 4: Loading check**
```typescript
const shouldShowLoading = (!hasLoadedInitialData || loadedPropertyId !== propertyId);
```

---

## CACHE LAYER BEHAVIOR ON PROPERTY SWITCH

### Layer 1: Zustand Dashboard Store

| Behavior | State |
|----------|-------|
| **Current state saved** | `propertyCache[PropertyA] = { ...state }` |
| **New property state loaded** | If cached, restore from `propertyCache[PropertyB]` |
| **If no cache** | Reset to `initialState`, `hasLoadedInitialData = false` |
| **Result** | SkeletonLoader shown until fetch completes |

**ISSUE:** `propertyCache` was recently added to persist, but may not work correctly due to:
1. MMKV instance mismatch with React Query persister
2. Large object serialization in MMKV
3. Partial hydration causing race conditions

---

### Layer 2: React Query Cache

| Behavior | State |
|----------|-------|
| **Cache NOT invalidated** | Stays for all properties |
| **Query key includes propertyId** | `'dashboard', propertyId` - different cache per property |
| **No cleanup** | Old property data stays in cache indefinitely |
| **gcTime = 24 hours** | Stale queries cleaned up eventually |

**Result:** React Query cache preserves data for all visited properties. Good for "back" navigation.

---

### Layer 3: AsyncStorage Cache (Staff Dashboard)

| Behavior | State |
|----------|-------|
| **No property scoping in key** | Uses `'staff-dashboard'` for all properties |
| **Cache may have wrong property data** | Shows stale data for new property |
| **No invalidation on switch** | Old data persists |

**ISSUE:** Staff dashboard uses same cache key for all properties. Data from Property A may show for Property B.

---

### Layer 4: Membership Cache

| Behavior | State |
|----------|-------|
| **Not property-scoped** | `@autopilot_membership:{userId}` contains all properties |
| **No change on switch** | Stays the same |
| **Role derived from membership** | Property role looked up from membership |

**Result:** Membership cache correctly provides property list for switcher.

---

## PROPERTY SWITCH ISSUES

### Issue 1: propertyCache Not Persisted (FIXED BUT UNVERIFIED)

**Symptom:** After app restart, switching properties shows loading even if previously visited.

**Root Cause:** `propertyCache` was NOT in `partialize` config before.

**Fix Applied:** Added `propertyCache` to persist config in `dashboardStore.ts`.

**Verification Needed:** Confirm `propertyCache` survives app restart.

---

### Issue 2: AsyncStorage Cache Key Collision (Staff)

**Symptom:** Staff dashboard shows data from wrong property after switch.

**Root Cause:** `useAsyncStorageCache` uses `'staff-dashboard'` key without property scope.

**Code:**
```typescript
// LovableStaffDashboard.tsx
const { cachedData } = useAsyncStorageCache({
  key: 'staff-dashboard',  // NOT property-scoped!
  propertyId,
  fetcher: fetchData,
});
```

**Fix Needed:** Add propertyId to cache key: `staff-dashboard-{propertyId}`

---

### Issue 3: No Zustand Cache in Other Dashboards

**Symptom:** MST, SoftServiceManager, SuperAdmin dashboards always re-fetch on property switch.

**Root Cause:** Only `LovablePropertyAdminDashboard` uses Zustand with `switchProperty()`.

**Evidence:** Other dashboards have no `switchProperty()` call:
- LovableMstDashboard: Uses React Query only
- LovableSoftServiceManagerDashboard: Uses local state only
- LovableSuperAdminDashboard: Org-level, no property concept

---

### Issue 4: Race Condition in switchProperty

**Symptom:** Loading shown briefly even when cache exists.

**Root Cause:**
```typescript
// LovablePropertyAdminDashboard.tsx lines 526-537
useEffect(() => {
  if (useDashboardStore.getState().loadedPropertyId !== propertyId) {
    switchProperty(propertyId);  // Async state update
  }
}, [propertyId]);

// Meanwhile, loading check:
const shouldShowLoading = (!hasLoadedInitialData || loadedPropertyId !== propertyId);
```

**Timeline:**
1. User switches property
2. `switchProperty()` called (async)
3. Component re-renders with old `loadedPropertyId`
4. `loadedPropertyId !== propertyId` → loading shown
5. `switchProperty()` completes, state updates
6. Component re-renders again, loading hides

**Fix Needed:** Add synchronous state check before async switch.

---

### Issue 5: React Query Not Synced with Zustand

**Symptom:** Prefetch writes to React Query, but dashboard reads from Zustand.

**Root Cause:** Prefetch service uses React Query, but dashboard uses Zustand.

**Code:**
```typescript
// prefetchService.ts
await queryClient.prefetchQuery({
  queryKey: ['property', propertyId, 'dashboard'],
  queryFn: fetchDashboardCounts,  // Writes to React Query
});

// LovablePropertyAdminDashboard.tsx
const { tickets } = useDashboardStore();  // Reads from Zustand
```

**Result:** Prefetch is wasted effort - dashboard doesn't use React Query data.

---

## CACHE SURVIVAL MATRIX

| Cache Layer | Survives Property Switch | Survives App Restart | Properly Scoped |
|-------------|-------------------------|---------------------|----------------|
| Zustand propertyCache | Yes | **?** (needs verification) | Yes |
| React Query | Yes | Yes | Yes (key includes propertyId) |
| AsyncStorage (Staff) | No | Yes | No |
| Membership | Yes | Yes | N/A (org-level) |

---

## RECOMMENDATIONS (Evidence Only)

1. **Verify propertyCache persistence** - Add logging to confirm `propertyCache` survives restart
2. **Scope AsyncStorage keys** - Add propertyId to all cache keys
3. **Add Zustand to other dashboards** - Implement switchProperty pattern in MST, SoftServiceManager
4. **Sync prefetch with Zustand** - Write prefetch results to Zustand, not just React Query
5. **Fix race condition** - Use `useMemo` or synchronous check before async switch