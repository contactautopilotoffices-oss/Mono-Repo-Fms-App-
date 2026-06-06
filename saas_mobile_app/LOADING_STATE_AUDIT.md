# LOADING STATE AUDIT
**Generated: 2026-06-06**
**Version: 1.0**

---

## OVERVIEW

This audit identifies ALL screens that show loading states and the conditions that trigger them.

---

## 1. ROOT LAYER LOADING

### RootLayout (`app/_layout.tsx`)

| Condition | Loading Shown | Duration |
|-----------|---------------|----------|
| `appReady === false` | `null` (blank) | Until fonts load |
| `showSplash && Platform !== 'web'` | `AutopilotSplash` | Until `onComplete` callback |

**Root Cause of Blank Screen:**
- Fonts load takes 1-3 seconds
- `SplashScreen.preventAutoHideAsync()` keeps native splash
- No loading indicator shown during this phase

**User Impact:** User sees blank screen (or native splash) while fonts load.

---

## 2. AUTH LAYER LOADING

### PropertyLayout (`app/property/[propertyId]/_layout.tsx`)

| Condition | Loading Shown | Duration |
|-----------|---------------|----------|
| `authLoading === true` | `ActivityIndicator` | Until Supabase session resolves |
| `accessState.checking === true` | `ActivityIndicator` | Until access check completes |
| `user && !membership` | `ActivityIndicator` | Until membership fetches |

**Blocking Code (Lines 50-55):**
```typescript
if (authLoading || accessState.checking || (user && !membership)) {
  return <ActivityIndicator />;
}
```

**Why Loading Appears Despite Cache:**
1. `authLoading` is `true` until `AuthContext` calls `getSession()`
2. Even if membership is cached, `user && !membership` check happens BEFORE membership loads
3. Access check requires network call to `checkPropertyAccess()`

**User Impact:** User sees spinner for 2-5 seconds even if previously authenticated.

---

## 3. DASHBOARD LOADING STATES

### LovablePropertyAdminDashboard

**File:** `components/dashboard/LovablePropertyAdminDashboard.tsx`

| Condition | Loading Shown |
|-----------|---------------|
| `!hasLoadedInitialData` | `SkeletonLoader` |
| `loadedPropertyId !== propertyId` | `SkeletonLoader` |

**Code (Lines 705-714):**
```typescript
const shouldShowLoading = (!hasLoadedInitialData || loadedPropertyId !== propertyId);

if (shouldShowLoading) {
  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: '#121212' }]}>
      <StatusBar barStyle="light-content" />
      <SkeletonLoader />
    </View>
  );
}
```

**Why Cache Not Rendered:**

1. **Zustand not hydrated yet**
   - On cold start, Zustand `persist` reads async from MMKV
   - `hasLoadedInitialData` is `false` until hydration completes
   - SkeletonLoader shown during hydration window

2. **Property ID mismatch**
   - User loaded Property A → `loadedPropertyId = 'A'`
   - App restarts → Zustand state partially restored
   - `loadedPropertyId` might be `null` or wrong
   - `loadedPropertyId !== propertyId` → loading shown

3. **propertyCache not persisted**
   - Even if `propertyCache` has data, it may not persist correctly
   - `switchProperty()` falls back to initial state

---

### LovableStaffDashboard

**File:** `components/dashboard/LovableStaffDashboard.tsx`

| Condition | Loading Shown |
|-----------|---------------|
| `!hasStaffCache && isLoading` | `SkeletonLoader` |

**Code Pattern:**
```typescript
const { cachedData, isLoading } = useAsyncStorageCache({ key: 'staff-dashboard' });
const hasStaffCache = Boolean(cachedData);

if (!hasStaffCache && isLoading) {
  return <SkeletonLoader />;
}
```

**Why Cache Not Rendered:**

1. **Cache key not property-scoped**
   - Uses `'staff-dashboard'` as key
   - On property switch, same cache used for different properties
   - Cache may have data for wrong property

2. **AsyncStorage async delay**
   - MMKV read is async for AsyncStorage compatibility
   - Brief window where `hasStaffCache = false`
   - Loading shown until cache resolves

---

### LovableMstDashboard

**File:** `components/dashboard/LovableMstDashboard.tsx`

| Condition | Loading Shown |
|-----------|---------------|
| `!hasValidDashboardData && isLoading` | `SkeletonLoader` |

**Code:**
```typescript
const hasValidDashboardData = Boolean(data?.tickets);

if (!hasValidDashboardData && isLoading) {
  return <SkeletonLoader />;
}
```

**Why Cache Not Rendered:**

1. **React Query cache not returned to component**
   - `useServerQuery` returns data from React Query
   - If data cached, `isLoading = false` immediately
   - But validation checks `data?.tickets` exists

2. **Cache structure mismatch**
   - `useServerQuery` expects `data.tickets` array
   - If API returns different structure, `hasValidDashboardData = false`
   - Loading shown despite cache

---

### LovableSoftServiceManagerDashboard

**File:** `components/dashboard/LovableSoftServiceManagerDashboard.tsx`

| Condition | Loading Shown |
|-----------|---------------|
| `isLoading` | `ActivityIndicator` |

**Code:**
```typescript
if (isLoading) {
  return <ActivityIndicator />;
}
```

**Why Loading Shown:**

1. **No cache check**
   - Just checks `isLoading` boolean
   - No attempt to load from cache before fetch

2. **No state persistence**
   - All data in local state
   - Lost on unmount
   - Re-fetches on every mount

---

## 4. MODULE LOADING STATES

### Tickets Module

**File:** `app/property/[propertyId]/tickets/index.tsx`

| Condition | Loading Shown |
|-----------|---------------|
| `isLoading && !tickets.length` | `SkeletonLoader` or `FlatList` with spinners |

**Cache Check:** Uses `queryClient.getQueryData()` but falls back to loading if null.

---

### Stock/Procurement Module

**File:** `app/property/[propertyId]/stock/index.tsx`

| Condition | Loading Shown |
|-----------|---------------|
| `isLoading` | `ActivityIndicator` |

**Cache Check:** None. Always fetches fresh data.

---

### Diesel Module

**File:** `app/property/[propertyId]/diesel/index.tsx`

| Condition | Loading Shown |
|-----------|---------------|
| `!isCached && isLoading` | `SkeletonLoader` |

**Cache Check:** `DieselPrefetchProvider` warms cache, but component checks `isCached`.

---

## 5. COMMON LOADING PATTERNS

### Pattern 1: SkeletonLoader

Used in:
- LovablePropertyAdminDashboard
- LovableStaffDashboard
- LovableMstDashboard

**Trigger:** `isLoading` or `!hasLoadedInitialData`

### Pattern 2: ActivityIndicator

Used in:
- PropertyLayout (access check)
- LovableSoftServiceManagerDashboard
- Generic loading states

**Trigger:** `isLoading` boolean

### Pattern 3: Spinner

Used in:
- AuthContext initial load
- Property selection

**Trigger:** `isLoading` state

---

## 6. WHY CACHE EXISTS BUT LOADING STILL APPEARS

### Root Cause Matrix

| Symptom | Root Cause | File | Line |
|---------|-----------|------|------|
| Skeleton shown despite cache | Zustand not hydrated | dashboardStore.ts | persist config |
| Skeleton despite propertyCache | propertyCache not persisted | dashboardStore.ts | partialize |
| Loading shown on return | Component unmount loses state | *.tsx | useEffect |
| Loading on restart | MMKV async read delay | storage.ts | mmkvAsyncStorage |
| Loading on property switch | No switchProperty in other dashboards | *.tsx | N/A |
| Wrong data shown | propertyCache collision | dashboardStore.ts | switchProperty |

---

## 7. BLOCKING VS NON-BLOCKING LOADING

### Blocking (prevents render)

```typescript
// PropertyLayout
if (authLoading || accessState.checking) {
  return <ActivityIndicator />;  // BLOCKS entire route
}
```

### Non-Blocking (shows alongside content)

```typescript
// Dashboard with pull-to-refresh
<ScrollView refreshControl={
  <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
}>
```

### Optimistic (shows cached, then updates)

```typescript
// React Query default behavior
// Shows cached data immediately
// Refetches in background
// Updates UI when fresh data arrives
```

---

## 8. RECOMMENDATIONS FOR EVIDENCE ONLY

(Not implementing, just documenting)

1. **Hydration Guard:** Add `const [hydrated, setHydrated] = useState(false)` and guard all Zustand reads
2. **Optimistic Property Switch:** Don't show loading if any cache exists for target property
3. **Unified Loading Pattern:** Standardize SkeletonLoader vs ActivityIndicator usage
4. **Cache-First Hook:** Create hook that always returns cached data immediately, then updates