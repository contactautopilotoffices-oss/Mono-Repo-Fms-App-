# APP STARTUP TRACE
**Generated: 2026-06-06**
**Version: 1.0**

---

## COLD START TIMELINE

### Phase 1: Native Bootstrap (0-100ms)

| Step | Action | Cache Hit/Miss | Network |
|------|--------|----------------|---------|
| 1 | App binary loads | N/A | N/A |
| 2 | JS bundle executes | N/A | N/A |
| 3 | ErrorBoundary initialized | N/A | N/A |
| 4 | PersistQueryClientProvider mounts | **MMKV read** | No |

**Evidence:** Provider wraps entire app. React Query hydrates from `autopilot-react-query-cache` in MMKV.

---

### Phase 2: Root Layout Mount (100-500ms)

| Step | Action | Cache Hit/Miss | Network |
|------|--------|----------------|---------|
| 5 | SplashScreen.lock() called | N/A | N/A |
| 6 | Fonts.loadAsync() starts | N/A | Yes (fonts) |
| 7 | AuthProvider mounts | **MMKV read** | No |
| 8 | AuthContext.useEffect fires | **MMKV read** | No |
| 9 | supabase.auth.getSession() | No | Yes |

**Evidence:** `AuthContext.tsx` lines 307-335 show:
```typescript
supabase.auth.getSession().then(({ data: { session } }) => {
  setSession(session);
  setUser(enrichUser(session?.user));
  if (session?.user) fetchMembership(session.user.id);
  setIsLoading(false);
});
```

**Problem:** Session restoration requires network call to Supabase. If offline or slow, user stays null.

---

### Phase 3: Session Restoration (500-2000ms)

| Step | Action | Cache Hit/Miss | Network |
|------|--------|----------------|---------|
| 10 | Supabase validates token | No | Yes |
| 11 | Session restored | No | Yes |
| 12 | fetchMembership() called | **MMKV check** | Yes |

**Evidence:** `AuthContext.tsx` lines 130-276:
```typescript
const cached = await loadCachedMembership(userId);
if (cached) {
  setMembership(cached);  // FAST PATH - no loading spinner
}
// Even with cache hit, re-fetches in background
```

**Cache Hit Path:** If `@autopilot_membership:{userId}` exists and not expired (24hr):
1. `setMembership(cached)` called immediately
2. No loading spinner shown
3. Background refetch continues

**Cache Miss Path:** If no cache or expired:
1. `setIsMembershipLoading(true)` called
2. Loading spinner shown
3. Network request to Supabase

---

### Phase 4: Property Resolution (2000-3000ms)

| Step | Action | Cache Hit/Miss | Network |
|------|--------|----------------|---------|
| 13 | Membership fetched | No | Yes |
| 14 | Properties extracted | N/A | N/A |
| 15 | dashboardStore.setDashboardData() called | N/A | No |
| 16 | triggerPrefetch() called | **Zustand + RQ** | Yes |

**Evidence:** `AuthContext.tsx` lines 361-369:
```typescript
const triggerPrefetch = useCallback(async (propertyId: string) => {
  await prefetchCriticalOnLogin(propertyId);    // Immediate
  setTimeout(() => prefetchImportantOnLogin(propertyId), 2000);
}, []);
```

**Prefetch Results:**
- `fetchDashboardCounts()` → Zustand
- `fetchTicketList()` → Zustand + React Query
- `fetchAttentionItems()` → Zustand
- `fetchTenantUserIds()` → Zustand

---

### Phase 5: Layout Resolution (3000-4000ms)

| Step | Action | Cache Hit/Miss | Network |
|------|--------|----------------|---------|
| 17 | PropertyLayout mounts | N/A | N/A |
| 18 | accessState.checking = true | N/A | No |
| 19 | checkPropertyAccess() called | **MMKV check** | Yes |

**Evidence:** `PropertyLayout` lines 20-50 show:
```typescript
if (authLoading || accessState.checking || (user && !membership)) {
  return <ActivityIndicator />;  // BLOCKS RENDER
}
```

**Problem:** This check blocks ALL property routes until access is verified. Even if membership is cached, this adds ~500ms of network latency.

---

### Phase 6: Dashboard Mount (4000-6000ms)

| Step | Action | Cache Hit/Miss | Network |
|------|--------|----------------|---------|
| 20 | LovablePropertyAdminDashboard mounts | N/A | N/A |
| 21 | useDashboardStore selectors called | **Zustand read** | No |
| 22 | hasLoadedInitialData checked | **MMKV read** | No |
| 23 | loadedPropertyId compared to prop | **Zustand read** | No |

**Evidence:** `LovablePropertyAdminDashboard.tsx` lines 94-95:
```typescript
const hasLoadedInitialData = useDashboardStore(state => state.hasLoadedInitialData);
const loadedPropertyId = useDashboardStore(state => state.loadedPropertyId);
```

**Loading Decision (lines 705-714):**
```typescript
const shouldShowLoading = (!hasLoadedInitialData || loadedPropertyId !== propertyId);

if (shouldShowLoading) {
  return <SkeletonLoader />;  // BLOCKS CONTENT
}
```

**Cache Hit Path:** If `hasLoadedInitialData === true` AND `loadedPropertyId === propertyId`:
1. No loading shown
2. Cached data renders immediately
3. Background refresh continues

**Cache Miss Path:** If `hasLoadedInitialData === false` OR `loadedPropertyId !== propertyId`:
1. SkeletonLoader shown
2. `fetchData()` called
3. 20+ parallel queries execute
4. `setDashboardData()` updates store
5. Re-render shows content

---

## SUMMARY: CACHE AVAILABILITY AT EACH STEP

| Step | Cache Available | Why |
|------|----------------|-----|
| 1-4 | React Query MMKV | Persisted from previous session |
| 5-9 | None | Session not yet restored |
| 10-12 | Membership MMKV | If not expired (24hr) |
| 13-16 | Dashboard Zustand | If previously loaded |
| 17-19 | Membership | If cached |
| 20-23 | Dashboard Zustand | If same propertyId |

---

## WHY LOADING APPEARS DESPITE CACHE

### Symptom 1: Dashboard shows skeleton despite cache

**Root Cause:** `loadedPropertyId` in Zustand does NOT match current `propertyId` prop.

**Scenario:**
1. User loaded Property A dashboard → `loadedPropertyId = 'A'`
2. User navigated to tickets
3. App was killed or user switched properties
4. User returns to Property A dashboard
5. **Problem:** If `propertyCache` was not persisted, Zustand state is reset
6. `loadedPropertyId` becomes `null` or wrong value
7. `hasLoadedInitialData` becomes `false`
8. SkeletonLoader shows despite having data in `propertyCache`

**Evidence:** `dashboardStore.ts` lines 98-129:
```typescript
switchProperty: (newPropertyId) => {
  // ...
  const cachedState = newCache[newPropertyId];
  if (cachedState) {
    return { ...state, ...cachedState, hasLoadedInitialData: true };
  }
  // No cache found - resets to initial state
  return { ...state, ...initialState, hasLoadedInitialData: false };
}
```

---

### Symptom 2: App restart shows loading

**Root Cause:** Zustand state is NOT fully hydrated from MMKV on cold start.

**Scenario:**
1. User loaded Property A dashboard
2. App closed (not backgrounded)
3. User reopened app
4. **Problem:** Zustand `persist` reads from MMKV asynchronously
5. During hydration, `hasLoadedInitialData` is `false`
6. SkeletonLoader shows until Zustand hydrates

**Evidence:** Zustand `persist` middleware is async, but React renders synchronously.

---

### Symptom 3: Navigate away, return, loads again

**Root Cause:** Component unmounts and loses React state. Zustand state is preserved but component doesn't read it.

**Scenario:**
1. User loads Property A dashboard
2. `fetchData()` populates Zustand
3. User navigates to tickets
4. Dashboard component unmounts
5. User presses back
6. Dashboard component remounts
7. **Problem:** If `switchProperty()` was called with wrong propertyId, cache is lost
8. Full re-fetch occurs

**Evidence:** `LovablePropertyAdminDashboard.tsx` lines 526-537:
```typescript
useEffect(() => {
  if (useDashboardStore.getState().loadedPropertyId !== propertyId) {
    switchProperty(propertyId);  // This may lose cache!
  }
}, [propertyId]);
```