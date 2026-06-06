# DASHBOARD TRACE
**Generated: 2026-06-06**
**Version: 1.0**

---

## 1. LovablePropertyAdminDashboard

**File:** `components/dashboard/LovablePropertyAdminDashboard.tsx`

### Cache Sources

| Source | Key | Persistence |
|--------|-----|-------------|
| Zustand Store | `useDashboardStore` | MMKV via zustandStorage |
| React Query | `queryKeys.property.dashboard(propertyId)` | MMKV via persister |
| AsyncStorage | None | None |

### Data Flow

```
1. Mount
   ↓
2. Read from useDashboardStore:
   - hasLoadedInitialData
   - loadedPropertyId
   - tickets, ticketCounts, etc.
   ↓
3. Check: !hasLoadedInitialData || loadedPropertyId !== propertyId
   ↓
4a. If TRUE (cache miss):
    - Show SkeletonLoader
    - Call fetchData()
    - 20+ parallel queries
    - setDashboardData() → Zustand + propertyCache
    - useDashboardFetch stores timestamp in RQ
    ↓
4b. If FALSE (cache hit):
    - Render cached content immediately
    - Background: useDashboardFetch triggers refetch after 5min
```

### Loading Condition (Line 705)

```typescript
const shouldShowLoading = (!hasLoadedInitialData || loadedPropertyId !== propertyId);
```

### Property Switch Handling (Lines 526-537)

```typescript
useEffect(() => {
  if (useDashboardStore.getState().loadedPropertyId !== propertyId) {
    switchProperty(propertyId);  // Saves to cache, restores from cache
  }
}, [propertyId]);
```

**SwitchProperty Logic (`dashboardStore.ts` lines 98-129):**
```typescript
switchProperty: (newPropertyId) => {
  if (state.loadedPropertyId === newPropertyId) return state;  // Same property - no-op
  
  const newCache = { ...state.propertyCache };
  if (state.loadedPropertyId) {
    newCache[state.loadedPropertyId] = { ...state };  // Save current
  }
  
  const cachedState = newCache[newPropertyId];  // Try to restore
  if (cachedState) {
    return { ...state, ...cachedState, hasLoadedInitialData: true };
  }
  
  // No cache - reset to initial state
  return { ...state, ...initialState, hasLoadedInitialData: false };
}
```

### Issues Identified

1. **propertyCache persistence** - Recently added but unverified
2. **Race condition** - `loadedPropertyId !== propertyId` triggers before `switchProperty` completes
3. **No optimistic render** - Shows skeleton even when cache exists but is for different property

---

## 2. LovableStaffDashboard

**File:** `components/dashboard/LovableStaffDashboard.tsx`

### Cache Sources

| Source | Key | Persistence |
|--------|-----|-------------|
| AsyncStorage | `useAsyncStorageCache` key `staff-dashboard` | MMKV via mmkvAsyncStorage |
| React Query | `queryKeys.property.dashboardStaff(propertyId)` | MMKV via persister |
| Zustand | None | None |

### Data Flow

```
1. Mount
   ↓
2. useAsyncStorageCache.load() → check MMKV
   ↓
3. hasStaffCache = Boolean(cachedData)
   ↓
4. if (!hasStaffCache) {
     setIsLoading(true)
     fetchData()
     saveStaffCache() → MMKV
   }
   ↓
5. Render content (loading or cached)
```

### Loading Condition (Derived from code)

```typescript
const hasStaffCache = Boolean(cachedData);
if (!hasStaffCache && isLoading) {
  return <SkeletonLoader />;
}
```

### Property Switch Handling

**NONE.** Relies on `propertyId` prop change triggering:
1. `useDashboardFetch` key change → re-fetch
2. No cache preservation across properties

### Issues Identified

1. **No per-property cache preservation** - Staff dashboard has no `switchProperty` equivalent
2. **Cache key collision** - Uses `staff-dashboard` without property scoping
3. **Double fetch** - Both `useAsyncStorageCache` AND `useDashboardFetch` may fetch

---

## 3. LovableSuperAdminDashboard

**File:** `components/dashboard/LovableSuperAdminDashboard.tsx`

### Cache Sources

| Source | Key | Persistence |
|--------|-----|-------------|
| Zustand Store | `useSuperAdminStore` | MMKV via zustandStorage |
| React Query | `queryKeys.admin.superAdmin(user?.id)` | MMKV via persister |

### Data Flow

```
1. Mount
   ↓
2. Read from useSuperAdminStore:
   - hasLoadedInitialData
   - properties, organizations, users
   ↓
3. isLoading = !hasLoadedInitialData && properties.length === 0
   ↓
4. Fallback: membership?.properties (instant, no loading)
   ↓
5. useDashboardFetch triggers fetchAll()
   - serverApi.get('/api/dashboard/super-admin')
   - setSuperAdminData() → Zustand
```

### Loading Condition

```typescript
const isLoading = !hasLoadedInitialData && properties.length === 0;
```

**Note:** Falls back to `membership?.properties` so never shows blank screen, but may show stale org list.

### Property Switch Handling

**NONE.** Org-level dashboard, no property concept.

### Issues Identified

1. **No per-org cache preservation** - `propertyCache` not implemented
2. **No org_id tracking** - `loadedOrgId` in store but not persisted
3. **Double fetch risk** - Uses both Zustand AND React Query for same data

---

## 4. LovableMstDashboard

**File:** `components/dashboard/LovableMstDashboard.tsx`

### Cache Sources

| Source | Key | Persistence |
|--------|-----|-------------|
| React Query | `queryKeys.property.mstDashboardLovable(propertyId)` | MMKV via persister |
| Zustand | None | None |

### Data Flow

```
1. Mount
   ↓
2. useServerQuery() → React Query cache check
   ↓
3. hasValidDashboardData = Boolean(data?.tickets)
   ↓
4. if (!hasValidDashboardData && !isFetching) {
     refetch()  // Manual trigger
   }
   ↓
5. Render: !hasValidDashboardData && isLoading → SkeletonLoader
```

### Loading Condition

```typescript
const hasValidDashboardData = Boolean(data?.tickets);
if (!hasValidDashboardData && isLoading) {
  return <SkeletonLoader />;
}
```

### Property Switch Handling

**NONE.** `useEffect` watches `propertyId` and triggers refetch:
```typescript
useEffect(() => {
  if (!hasValidDashboardData && !isFetching) {
    refetch();
  }
}, [propertyId, hasValidDashboardData, isFetching]);
```

### Issues Identified

1. **No Zustand state** - All data in React Query cache only
2. **No persistence** - Cache lost on app restart unless React Query MMKV persister works
3. **Manual refetch trigger** - Logic is complex and may miss cache hits

---

## 5. LovableSoftServiceManagerDashboard

**File:** `components/dashboard/LovableSoftServiceManagerDashboard.tsx`

### Cache Sources

| Source | Key | Persistence |
|--------|-----|-------------|
| Local State | `isLoading`, `property`, `tickets`, etc. | None (memory only) |
| React Query | `queryKeys.property.softService(propertyId)` | MMKV via persister |

### Data Flow

```
1. Mount
   ↓
2. useDashboardFetch() wraps fetchData()
   ↓
3. fetchData() sets isLoading = false in finally
   ↓
4. if (isLoading) return <ActivityIndicator />
```

### Loading Condition

```typescript
if (isLoading) {
  return <ActivityIndicator />;
}
```

**Note:** Uses simple spinner, not SkeletonLoader like other dashboards.

### Property Switch Handling

**NONE.** Uses `useEffect` closure over `propertyId`:
```typescript
useEffect(() => {
  if (propertyId) {
    refetch();  // useDashboardFetch refetch
  }
}, [propertyId]);
```

### Issues Identified

1. **No state persistence** - Local state only, lost on unmount
2. **No Zustand integration** - Different from all other dashboards
3. **No cache check** - Just shows loading boolean, no cache lookup

---

## COMPARISON TABLE

| Dashboard | Fetch Hook | Store | Persistence | Loading Type | Property Switch |
|-----------|-----------|-------|--------------|--------------|-----------------|
| PropertyAdmin | useDashboardFetch | Zustand | propertyCache (unverified) | SkeletonLoader | switchProperty() |
| Staff | useDashboardFetch | None | AsyncStorage | SkeletonLoader | None |
| SuperAdmin | useDashboardFetch | Zustand | Zustand (no cache) | Conditional | None |
| MST | useServerQuery | None | React Query only | SkeletonLoader | None |
| SoftServiceManager | useDashboardFetch | None | None | ActivityIndicator | None |

---

## KEY FINDINGS

### Finding 1: Inconsistent Patterns

Every dashboard uses a different caching strategy:
- PropertyAdmin: Zustand + per-property cache
- Staff: AsyncStorage
- SuperAdmin: Zustand only
- MST: React Query only
- SoftServiceManager: Local state only

### Finding 2: Property Switch is Only in PropertyAdmin

Only `LovablePropertyAdminDashboard` implements `switchProperty()`. Other dashboards:
- Don't save current state before switch
- Don't restore cached state for new property
- May show loading even if cache exists for different property

### Finding 3: MMKV Instance Fragmentation

Each caching layer may use different MMKV instances:
- `zustandStorage` - one MMKV
- `createSyncStoragePersister` - creates new MMKV
- `mmkvAsyncStorage` - another MMKV

This means React Query cache may not share state with Zustand.

### Finding 4: No Unified Cache Invalidation

When data changes (ticket created, property updated), there is no:
- Central invalidation event
- Cross-layer cache sync
- Cache versioning

Each layer handles invalidation independently.