# CACHE ARCHITECTURE MAP
**Generated: 2026-06-06**
**Version: 1.0**

---

## LAYER 1: MMKV Core Storage

| Property | Value |
|----------|-------|
| **Purpose** | Synchronous, high-performance key-value storage |
| **Location** | `react-native-mmkv` with ID `autopilot-app-cache` |
| **Source of Truth?** | Yes - raw storage layer |
| **Persistence** | Survives app restarts |
| **TTL** | None (manual invalidation) |

**Key Configuration (`utils/storage.ts`):**
```typescript
// MMKV ID: 'autopilot-app-cache'
// AsyncStorage fallback for Expo Go compatibility
```

**Exports:**
- `zustandStorage` - Zustand persist middleware adapter (sync MMKV → async fallback)
- `mmkvAsyncStorage` - Full AsyncStorage-compatible API (all methods async)

---

## LAYER 2: React Query Cache

| Property | Value |
|----------|-------|
| **Purpose** | Network request deduplication and caching |
| **Location** | MMKV via `createSyncStoragePersister` |
| **Source of Truth?** | Partial - cached responses, not app state |
| **Persistence** | Survives app restarts via MMKV |
| **TTL** | 5 min stale, 24hr garbage collection |

**Configuration (`utils/queryClient.ts`):**
```typescript
staleTime: 5 * 60 * 1000          // 5 minutes
gcTime: 24 * 60 * 60 * 1000       // 24 hours
retry: 2
refetchOnWindowFocus: false         // Mobile uses AppState instead
networkMode: 'offlineFirst'
```

**Persistence:**
```typescript
createSyncStoragePersister({
  storage: createMMKV(),
  key: 'autopilot-react-query-cache',
  throttleTime: 1000                // 1 second throttle
})
```

**ISSUE IDENTIFIED:** `createSyncStoragePersister` uses `createMMKV()` which may create a DIFFERENT MMKV instance than the one used for Zustand, causing cache fragmentation.

---

## LAYER 3: Zustand Dashboard Store

| Property | Value |
|----------|-------|
| **Purpose** | Per-property dashboard state management |
| **Location** | MMKV via `zustandStorage` |
| **Source of Truth?** | Yes - for dashboard UI state |
| **Persistence** | Full state persisted including `propertyCache` |
| **TTL** | None (manual invalidation) |

**Store Name:** `autopilot-dashboard-store`

**State Structure:**
```
tickets: Ticket[]
ticketCounts: { all, month, today }
sopCount: number
sopTotal: number
energyKwh: number
energyTrend: number
propertyName: string
loadedPropertyId: string | null
vmsStats: { total, in, out }
vendorStats: { revenue, commission }
dieselStats: { level, consumption }
healthScore: number | null
attentionItems: Ticket[]
ticketFunnel: { status, count }[]
tenantUserIds: string[]
hasLoadedInitialData: boolean
lastUpdatedAt: number | null
backgroundImage: string
propertyCache: Record<string, Partial<DashboardState>>
```

**Hydration Flow:**
1. App starts → MMKV read → state restored
2. Component reads `hasLoadedInitialData` and `loadedPropertyId`
3. If `hasLoadedInitialData === false` OR `loadedPropertyId !== current propertyId` → show loading

**Critical Issue:** `propertyCache` was NOT persisted until recently added. Still need to verify it persists correctly.

---

## LAYER 4: Auth Membership Cache

| Property | Value |
|----------|-------|
| **Purpose** | User organization and property memberships |
| **Location** | MMKV via `mmkvAsyncStorage` |
| **Source of Truth?** | Yes - for auth and permissions |
| **Persistence** | Survives restarts, cleared on sign-out |
| **TTL** | 24 hours |

**Cache Keys:** `@autopilot_membership:{userId}`

**Cache Structure:**
```json
{
  "data": { org_id, org_name, org_role, properties[] },
  "timestamp": 1749200000000
}
```

**Hydration Flow:**
1. App starts → `AuthContext` mounts
2. `getSession()` called via Supabase
3. If session exists → `fetchMembership(userId)`
4. `loadCachedMembership()` checks MMKV for valid cache
5. Cache hit → `setMembership(cached)` immediately (no loading spinner)
6. Background refetch keeps data fresh

**Foreground Re-validation:**
```typescript
AppState.addEventListener('change', (nextAppState) => {
  if (nextAppState === 'active' && user?.id) {
    fetchMembership(user.id);  // Re-fetch in background
  }
});
```

---

## LAYER 5: AsyncStorage Cache Hooks

| Hook | Purpose | TTL |
|------|---------|-----|
| `useAsyncStorageCache` | Generic cache with TTL | 5 min stale, 24hr GC |
| `useCachedServerQuery` | Cache-first data fetching | 5 min stale |
| `useServerQuery` | React Query wrapper | 5 min stale, 24hr GC |

**Storage Key Pattern:** `@autopilot_cache:{key}`

**Entry Structure:**
```json
{
  "data": <any>,
  "timestamp": <number>,
  "propertyId": <string>
}
```

**Property Mismatch Behavior:** If cached `propertyId` !== current `propertyId`, treats as stale/missing.

---

## LAYER 6: Prefetch Service

| Property | Value |
|----------|-------|
| **Purpose** | Warm cache on login before navigation |
| **Trigger** | `signIn()` success |
| **Tier 1** | Immediate - counts, tickets, attention items |
| **Tier 2** | 2 second delay - checklist, diesel, electricity, users, stock |

**Query Keys Prefetched:**
```
['property', propertyId, 'dashboard']
['tickets', propertyId, 'all', 'all', 'false', '20']
['property', propertyId, 'checklist']
['property', propertyId, 'diesel']
['property', propertyId, 'electricity']
['property', propertyId, 'users']
['property', propertyId, 'stock']
```

---

## HYDRATION ORDER (Critical Issue!)

Current provider order:
```
1. ErrorBoundary
2. PersistQueryClientProvider     ← React Query hydrates FIRST
3. GestureHandlerRootView
4. SafeAreaProvider
5. ThemeProvider
6. AuthProvider                   ← Membership hydrates SECOND
7. BottomSheetModalProvider
8. AppContent
```

**PROBLEM:** React Query hydrates from MMKV BEFORE AuthProvider sets up. This means:
- React Query cache is available early
- But `user` and `membership` are null until AuthProvider resolves
- Queries that depend on `user.id` or `propertyId` cannot be enabled until later

---

## PERSISTENCE STRATEGY SUMMARY

| Layer | Storage | Survives Restart | TTL |
|-------|---------|-------------------|-----|
| MMKV Core | react-native-mmkv | Yes | None |
| React Query | MMKV (separate instance?) | Yes* | 5min stale |
| Zustand Dashboard | MMKV via zustandStorage | Yes | None |
| Auth Membership | MMKV via mmkvAsyncStorage | Yes | 24hr |
| AsyncStorage Cache | MMKV via mmkvAsyncStorage | Yes | 5min stale |
| Prefetch | Zustand + React Query | Partial | 5min |

*MMKV instance mismatch between React Query persister and Zustand may cause persistence issues.

---

## KNOWN ARCHITECTURE ISSUES

1. **MMKV Instance Mismatch**: React Query `createSyncStoragePersister` uses `createMMKV()` which may not share state with `zustandStorage` MMKV instance.

2. **Property Cache Persistence**: Added `propertyCache` to persist but needs verification.

3. **Hydration Race**: React Query hydrates before AuthProvider, causing enabled queries to wait.

4. **Inconsistent Patterns**: Different dashboards use different caching strategies (Zustand vs AsyncStorage vs React Query only).

5. **No Global Cache Invalidation**: No centralized cache busting when data changes elsewhere.
