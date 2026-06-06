# QUERY CACHE AUDIT
**Generated: 2026-06-06**
**Version: 1.0**

---

## QUERY INVENTORY

### 1. Dashboard Queries

#### LovablePropertyAdminDashboard - fetchData()

**Query Keys:** None explicitly (uses `useDashboardFetch` timestamp pattern)

**Stale Time:** 5 minutes (default from queryClient)

**Queries Executed:**
```typescript
// 15 parallel queries in bulkQueries
serverApi.query({ table: 'properties', action: 'select', ... })         // property name
serverApi.query({ table: 'tickets', action: 'select', ... })              // ticket list
serverApi.query({ table: 'sop_templates', action: 'select', ... })      // SOP count
serverApi.query({ table: 'sop_completions', action: 'select', ... })     // today completions
serverApi.query({ table: 'visitor_logs', action: 'select', ... })       // VMS stats
serverApi.query({ table: 'vendor_daily_revenue', action: 'select', ... }) // revenue
serverApi.query({ table: 'tickets', action: 'select', count: 'exact' })   // 7 count queries
serverApi.query({ table: 'property_memberships', action: 'select', ... }) // tenant IDs

// Per-property queries (Promise.all with propIds)
serverApi.query({ table: 'electricity_readings', ... })                 // elec
serverApi.query({ table: 'diesel_readings', ... })                       // diesel
serverApi.rpc('get_property_health_score', { ... })                     // health
serverApi.rpc('get_attention_items', { ... })                            // attention
serverApi.rpc('get_ticket_funnel', { ... })                              // funnel
ppmService.fetchStats(pid)                                               // PPM
```

**Cache Source:** Zustand `dashboardStore` (NOT React Query)

**Issue:** Data stored in Zustand, NOT in React Query. `useDashboardFetch` only stores timestamp.

---

#### LovableStaffDashboard - fetchData()

**Query Keys:** `['dashboard-staff', propertyId]`

**Stale Time:** 5 minutes

**Queries Executed:**
```typescript
serverApi.query({ table: 'properties', action: 'select', ... })         // property name
serverApi.query({ table: 'tickets', action: 'select', ... })            // ticket list
serverApi.query({ table: 'resolver_stats', action: 'select', ... })    // shift status
serverApi.query({ table: 'mst_skills', action: 'select', ... })        // MST skills
serverApi.query({ table: 'resolver_stats', action: 'select', ... })     // resolver stats
ppmService.fetchStats(propertyId)                                        // PPM
```

**Cache Source:** AsyncStorage via `useAsyncStorageCache`

**Issue:** Uses BOTH AsyncStorage AND React Query, but data goes to AsyncStorage only.

---

#### LovableMstDashboard - useServerQuery()

**Query Keys:** `['mst-dashboard-lovable', propertyId]`

**Stale Time:** 5 minutes

**Queries Executed:**
```typescript
serverApi.query({ table: 'properties', action: 'select', ... })         // property name
serverApi.query({ table: 'tickets', action: 'select', ... })            // ticket list
serverApi.query({ table: 'resolver_stats', action: 'select', ... })     // shift status
```

**Cache Source:** React Query (proper data caching)

**Issue:** None - uses React Query correctly for data caching.

---

### 2. Ticket Queries

#### ticketService.fetchTickets()

**Query Keys:** `['tickets', propertyId, status, priority, internal, limit]`

**Stale Time:** 5 minutes

**Queries Executed:**
```typescript
serverApi.query({
  table: 'tickets',
  action: 'select',
  select: 'id, title, status, priority, created_at, internal, raised_by, ...',
  filters: [{ column: 'property_id', value: propertyId }, ...],
  orders: [{ column: 'created_at', ascending: false }],
  limit: 20
})
```

**Cache Source:** React Query (used by ticket list screens)

---

#### ticketService.getTicketById()

**Query Keys:** `['ticket', ticketId]`

**Stale Time:** 5 minutes

**Queries Executed:**
```typescript
serverApi.query({
  table: 'tickets',
  action: 'select',
  filters: [{ column: 'id', value: ticketId }],
  maybeSingle: true
})
```

**Cache Source:** React Query

---

### 3. Property Queries

#### propertyService.getPropertyFeatures()

**Query Keys:** `['property', propertyId, 'features']`

**Stale Time:** 5 minutes

**Queries Executed:**
```typescript
serverApi.query({
  table: 'organizations',
  action: 'select',
  select: 'available_modules',
  filters: [{ column: 'id', value: orgId }],
 maybeSingle: true
})
```

**Cache Source:** React Query

---

### 4. User Queries

#### userService.getUsersByProperty()

**Query Keys:** `['property', propertyId, 'users']`

**Stale Time:** 5 minutes

**Queries Executed:**
```typescript
serverApi.query({
  table: 'property_memberships',
  action: 'select',
  select: 'user_id, role, ...',
  filters: [{ column: 'property_id', value: propertyId }]
})
```

**Cache Source:** React Query

---

### 5. Stock/Procurement Queries

#### stockService.fetchStockItems()

**Query Keys:** `['property', propertyId, 'stock']`

**Stale Time:** 5 minutes

**Queries Executed:**
```typescript
serverApi.query({
  table: 'stock_items',
  action: 'select',
  filters: [{ column: 'property_id', value: propertyId }]
})
```

**Cache Source:** React Query

---

### 6. Prefetch Queries

#### prefetchCriticalOnLogin()

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

**Stale Time:** 5 minutes

**Issue:** Prefetch writes to React Query cache, but dashboard reads from Zustand. Prefetch may be wasted.

---

## QUERY PATTERNS ANALYSIS

### Pattern 1: useDashboardFetch (Timestamp-Only)

**Used by:**
- LovablePropertyAdminDashboard
- LovableStaffDashboard
- LovableSoftServiceManagerDashboard

**Behavior:**
```typescript
// useDashboardFetch.ts
const result = useQuery({
  queryKey,
  queryFn: async () => {
    await fetchFn();  // fetchFn stores data in Zustand/AsyncStorage
    return Date.now();  // React Query only stores timestamp
  },
  staleTime: 5 * 60 * 1000,
});
```

**Problem:** React Query cache stores only timestamp, NOT actual data. Data stored in Zustand/AsyncStorage.

**Cache Hit Path:**
1. React Query checks cache for timestamp
2. If fresh (< 5 min), returns cached timestamp
3. Component reads from Zustand/AsyncStorage
4. No network request

**Cache Miss Path:**
1. React Query cache miss or stale
2. `fetchFn()` called
3. Data stored in Zustand/AsyncStorage
4. Timestamp stored in React Query
5. Network request executed

---

### Pattern 2: useServerQuery (Data-Returning)

**Used by:**
- LovableMstDashboard
- Generic server queries

**Behavior:**
```typescript
const result = useQuery({
  queryKey,
  queryFn: async () => {
    const { data } = await serverApi.query(...);
    return data;
  },
  staleTime: 5 * 60 * 1000,
});

// Component uses result.data directly
```

**Problem:** None - uses React Query correctly.

---

### Pattern 3: Direct serverApi.query (No Caching)

**Used by:**
- LovablePropertyAdminDashboard (20+ queries)
- PropertyLayout access check
- Various service methods

**Behavior:**
```typescript
const { data } = await serverApi.query({
  table: 'tickets',
  action: 'select',
  ...
});
```

**Problem:** No React Query caching. Every call hits network.

---

## QUERY ISSUES SUMMARY

| Issue | Query | Impact | File |
|-------|-------|--------|------|
| Data stored in Zustand, not RQ | Dashboard queries | Cache may not persist | LovablePropertyAdminDashboard.tsx |
| Double storage (Async + RQ) | Staff dashboard | Wasteful | LovableStaffDashboard.tsx |
| No caching | PropertyLayout access | Always network | PropertyLayout.tsx |
| Prefetch targets wrong store | Login prefetch | Wasted prefetch | prefetchService.ts |
| No cache check | SoftServiceManager | Always loads | LovableSoftServiceManagerDashboard.tsx |
| MMKV instance mismatch | All React Query | Cache may not persist | queryClient.ts |

---

## DUPLICATE QUERIES

### Ticket Queries

| Key Pattern | Used By | Duplication |
|-------------|---------|-------------|
| `['tickets', propertyId, ...]` | ticketService, prefetchService | Yes |
| `['ticket', ticketId]` | ticket detail screens | Yes |

### Property Queries

| Key Pattern | Used By | Duplication |
|-------------|---------|-------------|
| `['property', propertyId, 'dashboard']` | prefetchService | Yes |
| `['property', propertyId, 'features']` | usePropertyModules | Yes |

---

## WHICH QUERIES ALWAYS HIT NETWORK

1. **PropertyLayout access check** - `checkPropertyAccess()` every mount
2. **LovablePropertyAdminDashboard** - 20+ direct `serverApi.query()` calls
3. **LovableSoftServiceManagerDashboard** - Sequential queries with no caching
4. **PropertySwitcherModal** - `serverApi.query()` for property list