# Application Data Architecture

**Version:** 1.0
**Date:** 2026-06-02
**Scope:** `saas_mobile_app` — Application-wide server state management
**Status:** Design Document — Pending Approval

---

## 1. Executive Summary

This document defines the target data architecture for `saas_mobile_app`. The current architecture uses React Query as a fetch scheduler while storing actual data in local `useState`. This causes infinite loading, ignored caches, and full-screen spinners on every navigation.

The target architecture makes **React Query the single source of truth for all server state**. MMKV persists actual query data. UI renders directly from the query cache. Background refresh occurs silently via stale-while-revalidate.

---

## 2. Current Architecture

### 2.1 Pattern Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CURRENT ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  API (Supabase / serverApi)                                                 │
│    │                                                                        │
│    ▼                                                                        │
│  ┌─────────────────────┐                                                   │
│  │  useDashboardFetch  │──→ useQuery({                                    │
│  │                     │       queryFn: async () => {                      │
│  │                     │         await fetchFn();  // side effect only    │
│  │                     │         return Date.now();  // timestamp         │
│  │                     │       }                                          │
│  │                     │    })                                            │
│  └─────────┬───────────┘                                                   │
│            │ returns { refetch } only                                     │
│            │                                                               │
│            ▼                                                               │
│  ┌─────────────────────┐                                                   │
│  │   fetchData (void)  │──→ supabase queries                              │
│  │                     │──→ setProperty(data)                             │
│  │                     │──→ setTickets(data)                              │
│  │                     │──→ setIsCheckedIn(data)                          │
│  │                     │──→ saveAsyncStorageCache(data)                   │
│  └─────────┬───────────┘                                                   │
│            │                                                               │
│            ▼                                                               │
│  ┌─────────────────────┐                                                   │
│  │    Local useState   │──→ property: { name } | null                     │
│  │                     │──→ tickets: Ticket[]                             │
│  │                     │──→ isCheckedIn: boolean                          │
│  │                     │──→ isLoading: boolean                            │
│  └─────────┬───────────┘                                                   │
│            │                                                               │
│            ▼                                                               │
│  ┌─────────────────────┐                                                   │
│  │         UI          │──→ reads from local state                        │
│  │                     │──→ shows spinner when isLoading = true           │
│  └─────────────────────┘                                                   │
│                                                                             │
│  PARALLEL CACHE SYSTEMS:                                                   │
│  1. React Query (MMKV) ──→ stores Date.now() timestamps                   │
│  2. AsyncStorage ──→ stores { property, tickets, isCheckedIn }            │
│  3. Zustand + AsyncStorage ──→ stores full dashboard state (1 screen)    │
│                                                                             │
│  FAILURE: When React Query cache is fresh, it skips queryFn.              │
│  fetchData never runs. Local state never populated. isLoading stays true. │
│  → INFINITE SPINNER                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Anti-Patterns Present

| Anti-Pattern | Count | Impact |
|-------------|-------|--------|
| React Query stores timestamps, not data | 47 files | Cache is useless |
| Local `useState` mirrors server data | 47 files | State lost on unmount |
| Dual/triple parallel cache systems | 5 files | Race conditions, inconsistency |
| `isLoading` tied to fetch completion | 47 files | Infinite loading risk |
| No cache-first rendering | 47 files | Full spinner on every mount |
| No `invalidateQueries` on mutations | 47 files | Stale data persists |
| No `useFocusEffect` for refresh | 47 files | No background refresh on nav back |
| `signOut` does not clear query cache | 1 file | Cross-user data leakage risk |

---

## 3. Target Architecture

### 3.1 Pattern Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            TARGET ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  API (Supabase / serverApi)                                                 │
│    │                                                                        │
│    ▼                                                                        │
│  ┌─────────────────────┐                                                   │
│  │    useServerQuery   │──→ useQuery<T>({                                  │
│  │    (new hook)       │       queryFn: fetchDashboardData,  // returns T │
│  │                     │    })                                              │
│  └─────────┬───────────┘                                                   │
│            │ returns { data, isLoading, isFetching, error, refetch }       │
│            │                                                               │
│            ▼                                                               │
│  ┌─────────────────────┐                                                   │
│  │  React Query Cache  │──→ stores ACTUAL data: DashboardData             │
│  │  (in-memory)        │                                                   │
│  └─────────┬───────────┘                                                   │
│            │                                                               │
│            ▼                                                               │
│  ┌─────────────────────┐                                                   │
│  │  MMKV Persister     │──→ persists cache to disk                        │
│  │  (async restore)    │──→ survives app restarts                         │
│  └─────────┬───────────┘                                                   │
│            │                                                               │
│            ▼                                                               │
│  ┌─────────────────────┐                                                   │
│  │         UI          │──→ reads from query.data                         │
│  │                     │──→ shows spinner ONLY when !data && isLoading   │
│  │                     │──→ shows subtle indicator when isFetching       │
│  └─────────────────────┘                                                   │
│                                                                             │
│  SINGLE CACHE SYSTEM:                                                      │
│  React Query (MMKV) ──→ single source of truth for ALL server state      │
│                                                                             │
│  SUCCESS: Cache hit returns data instantly. Background refetch silently.   │
│  → INSTANT RENDER                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Design Principles

| Principle | Rule |
|-----------|------|
| **Single Source of Truth** | React Query cache is the ONLY cache for server state. No AsyncStorage, no Zustand, no local `useState` for server data. |
| **Cache-First Rendering** | UI renders from `query.data` immediately. Never wait for a fetch to complete before rendering. |
| **Stale-While-Revalidate** | Fresh cache → instant render + background refetch. Stale cache → instant render + background refetch. No cache → fetch + render. |
| **Property-Aware Keys** | Every query key includes `propertyId` as the second segment. Switching properties automatically isolates caches. |
| **Offline-First** | `networkMode: 'offlineFirst'` preserves cached data when offline. Mutations queue when offline. |
| **Optimistic Updates** | Mutations update React Query cache immediately, then refetch to confirm. No local optimistic state. |
| **Automatic Invalidation** | Mutations invalidate related queries automatically. No manual cache management. |

---

## 4. Data Flow

### 4.1 Read Flow (Cache Hit)

```
User navigates to Dashboard
        │
        ▼
useServerQuery(['mst-dashboard', propertyId], fetchFn)
        │
        ▼
React Query checks cache for key ['mst-dashboard', propertyId]
        │
        ├── Cache HIT (data exists, any freshness)
        │       │
        │       ▼
        │   Return cached data immediately
        │       │
        │       ▼
        │   isLoading = false
        │   isFetching = true (if stale) or false (if fresh)
        │       │
        │       ▼
        │   UI renders from data
        │       │
        │       ▼
        │   Background refetch starts (if stale or on focus)
        │       │
        │       ▼
        │   Fresh data replaces cache
        │       │
        │       ▼
        │   UI re-renders only if data changed
        │
        └── Cache MISS
                │
                ▼
            isLoading = true
                │
                ▼
            fetchFn executes
                │
                ▼
            Data stored in cache
                │
                ▼
            isLoading = false
                │
                ▼
            UI renders from data
```

### 4.2 Write Flow (Mutation)

```
User creates a ticket
        │
        ▼
useMutation({
  mutationFn: createTicketAPI,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['tickets', propertyId] });
    queryClient.invalidateQueries({ queryKey: ['mst-dashboard', propertyId] });
  }
})
        │
        ▼
API call succeeds
        │
        ▼
Related queries marked as stale
        │
        ▼
Next render: stale data shown instantly
        │
        ▼
Background refetch updates cache
        │
        ▼
UI shows fresh data
```

### 4.3 Optimistic Update Flow

```
User toggles shift status
        │
        ▼
queryClient.setQueryData(['mst-dashboard', propertyId], (old) => ({
  ...old,
  isCheckedIn: !old.isCheckedIn
}))
        │
        ▼
UI updates instantly (cache updated)
        │
        ▼
API call to update resolver_stats
        │
        ▼
API succeeds → cache already correct
        │
        ▼
API fails → queryClient.invalidateQueries(...) → refetch true state
```

---

## 5. Cache Flow

### 5.1 Cache Lifecycle

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   FRESH     │────▶│   STALE     │────▶│  FETCHING   │────▶│   FRESH     │
│  (< 5 min)  │     │  (> 5 min)  │     │  (network)  │     │  (updated)  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │                   │
       ▼                   ▼                   ▼                   ▼
  Instant render      Instant render     Show old data      Instant render
  No refetch          Background refetch  + subtle spinner   No refetch
```

### 5.2 Persistence Flow

```
Query Data
    │
    ▼
React Query In-Memory Cache
    │
    ├── Active queries ──→ kept in memory
    │
    └── Inactive queries ──→ persisted to MMKV
            │
            ▼
        MMKV Storage (async)
            │
            ▼
        App Restart
            │
            ▼
        PersistQueryClientProvider restores cache
            │
            ▼
        React Query cache populated with actual data
            │
            ▼
        First query reads from restored cache instantly
```

### 5.3 Cache Invalidation Rules

| Event | Invalidated Query Keys |
|-------|----------------------|
| Ticket created | `['tickets', propertyId]`, `['mst-dashboard', propertyId]` |
| Ticket updated | `['tickets', propertyId]`, `['ticket-detail', ticketId]`, `['mst-dashboard', propertyId]` |
| Ticket deleted | `['tickets', propertyId]`, `['mst-dashboard', propertyId]` |
| Shift toggled | `['mst-dashboard', propertyId]`, `['staff-dashboard', propertyId]` |
| Visitor checked in | `['visitors', propertyId]`, `['mst-dashboard', propertyId]` |
| Stock updated | `['stock', propertyId]` |
| Settings changed | `['settings', propertyId]` |
| User signs out | `queryClient.clear()` — ALL keys |
| Property switched | Previous property keys naturally isolated by key segment |

---

## 6. Hydration Flow

### 6.1 App Cold Start

```
App Launch
    │
    ▼
PersistQueryClientProvider mounts
    │
    ▼
MMKV cache restore starts (async, ~50-100ms)
    │
    ▼
App renders children (queries may run during restore)
    │
    ▼
┌─────────────────────────────────────────┐
│  Scenario A: Restore completes first    │
│     │                                   │
│     ▼                                   │
│  Query reads restored cache             │
│  isLoading = false                      │
│  UI renders instantly                   │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Scenario B: Query mounts first         │
│     │                                   │
│     ▼                                   │
│  Query sees empty cache                 │
│  isLoading = true                       │
│  Fetch starts                           │
│     │                                   │
│     ▼                                   │
│  Restore completes                      │
│  Query re-evaluates, sees restored data │
│  isLoading = false                      │
│  Fetch may be cancelled if fresh        │
└─────────────────────────────────────────┘
```

### 6.2 Navigation Hydration

```
User on Dashboard (cache warm)
    │
    ▼
User taps Tickets
    │
    ▼
Dashboard component unmounts
    │
    ▼
React Query cache RETAINED in memory
    │
    ▼
User taps Back
    │
    ▼
Dashboard component remounts
    │
    ▼
useServerQuery reads from IN-MEMORY cache
    │
    ▼
Data returned instantly (< 1ms)
    │
    ▼
isLoading = false
    │
    ▼
UI renders immediately
    │
    ▼
isFetching = true (if data is stale)
    │
    ▼
Background refetch runs silently
```

---

## 7. Property Switching Flow

### 7.1 Property Isolation

Query keys MUST include `propertyId` as the second segment:

```typescript
// Correct — property-scoped
['mst-dashboard', '79ba1aa5-bf91-4956-9dbe-ce9986790b53']
['tickets', '79ba1aa5-bf91-4956-9dbe-ce9986790b53']
['visitors', '79ba1aa5-bf91-4956-9dbe-ce9986790b53']

// Incorrect — global, cross-property pollution
['mst-dashboard']
['tickets']
```

### 7.2 Switching Properties

```
User switches from Property A to Property B
    │
    ▼
Old queries with key ['*', 'property-a'] become inactive
    │
    ▼
New queries with key ['*', 'property-b'] mount
    │
    ▼
React Query checks cache for Property B keys
    │
    ├── Cache HIT → instant render
    │
    └── Cache MISS → fetch + render
    │
    ▼
Old Property A cache remains in MMKV (garbage collected after gcTime)
```

### 7.3 Property-Specific Hook Design

All data hooks MUST accept `propertyId` and include it in the query key:

```typescript
function useTickets(propertyId: string) {
  return useServerQuery(
    ['tickets', propertyId],
    () => fetchTickets(propertyId),
    { enabled: !!propertyId }
  );
}

function useDashboardData(propertyId: string, userId?: string) {
  return useServerQuery(
    ['mst-dashboard', propertyId],
    () => fetchDashboardData(propertyId, userId),
    { enabled: !!propertyId }
  );
}
```

---

## 8. Offline Flow

### 8.1 Offline Read

```
Device goes offline
    │
    ▼
User navigates to Dashboard
    │
    ▼
useServerQuery runs
    │
    ▼
React Query checks cache
    │
    ├── Cache HIT → instant render from cached data
    │
    └── Cache MISS → isLoading = true, fetch fails
            │
            ▼
        retry: 2 (default) → both fail
            │
            ▼
        error state → show offline message OR empty state
```

### 8.2 Offline Write (Mutation)

```
Device goes offline
    │
    ▼
User creates ticket
    │
    ▼
useMutation runs
    │
    ▼
API call fails (network error)
    │
    ▼
React Query retries (retry: 1 for mutations)
    │
    ▼
Retry fails
    │
    ▼
Mutation stays in pending state
    │
    ▼
User sees error: "Will sync when online"
    │
    ▼
Device comes back online
    │
    ▼
Mutation automatically retries (if configured with persist)
    │
    ▼
On success: invalidate related queries
```

### 8.3 Offline Configuration

```typescript
// utils/queryClient.ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60 * 24,
      retry: 2,
      refetchOnWindowFocus: false,
      networkMode: 'offlineFirst',  // ← critical for offline
    },
    mutations: {
      retry: 1,
      networkMode: 'offlineFirst',  // ← critical for offline
    },
  },
});
```

---

## 9. Module Data Models

### 9.1 Dashboard Module

```typescript
// types/dashboard.ts
interface DashboardData {
  property: { name: string } | null;
  tickets: Ticket[];
  isCheckedIn: boolean;
}

// hooks/queries/useDashboardData.ts
export function useDashboardData(propertyId: string, userId?: string) {
  return useServerQuery<DashboardData>(
    ['mst-dashboard', propertyId],
    () => fetchDashboardData(propertyId, userId),
    { enabled: !!propertyId, staleTime: 1000 * 60 * 5 }
  );
}
```

### 9.2 Tickets Module

```typescript
// types/ticket.ts (already exists)

// hooks/queries/useTickets.ts
export function useTickets(propertyId: string, filters?: TicketFilters) {
  return useServerQuery<Ticket[]>(
    ['tickets', propertyId, filters],  // filters in key for cache isolation
    () => fetchTickets(propertyId, filters),
    { enabled: !!propertyId }
  );
}

// hooks/queries/useTicketDetail.ts
export function useTicketDetail(ticketId: string) {
  return useServerQuery<Ticket>(
    ['ticket-detail', ticketId],
    () => fetchTicketDetail(ticketId),
    { enabled: !!ticketId }
  );
}
```

### 9.3 Visitors Module

```typescript
// hooks/queries/useVisitors.ts
export function useVisitors(propertyId: string) {
  return useServerQuery<Visitor[]>(
    ['visitors', propertyId],
    () => fetchVisitors(propertyId),
    { enabled: !!propertyId }
  );
}
```

### 9.4 Stock Module

```typescript
// hooks/queries/useStock.ts
export function useStock(propertyId: string) {
  return useServerQuery<StockItem[]>(
    ['stock', propertyId],
    () => fetchStockItems(propertyId),
    { enabled: !!propertyId }
  );
}
```

### 9.5 User Profile Module

```typescript
// hooks/queries/useUserProfile.ts
export function useUserProfile(userId?: string) {
  return useServerQuery<UserProfile>(
    ['user-profile', userId ?? 'none'],
    () => fetchUserProfile(userId),
    { enabled: !!userId }
  );
}
```

---

## 10. File Structure (Target)

```
saas_mobile_app/
├── hooks/
│   ├── queries/                    # Domain-specific query hooks
│   │   ├── useDashboardData.ts
│   │   ├── useTickets.ts
│   │   ├── useTicketDetail.ts
│   │   ├── useVisitors.ts
│   │   ├── useStock.ts
│   │   ├── useRooms.ts
│   │   ├── useSecurityLogs.ts
│   │   ├── useChecklists.ts
│   │   ├── usePPM.ts
│   │   ├── useProcurement.ts
│   │   ├── useDiesel.ts
│   │   ├── useElectricity.ts
│   │   ├── useReports.ts
│   │   ├── useVendors.ts
│   │   ├── useUsers.ts
│   │   ├── useCassandraRooms.ts
│   │   └── useSettings.ts
│   │
│   ├── mutations/                  # Domain-specific mutation hooks
│   │   ├── useCreateTicket.ts
│   │   ├── useUpdateTicket.ts
│   │   ├── useDeleteTicket.ts
│   │   ├── useToggleShift.ts
│   │   └── ...
│   │
│   └── useServerQuery.ts           # Core wrapper (replaces useDashboardFetch)
│
├── utils/
│   ├── queryClient.ts              # Unchanged — already correct
│   └── queryKeys.ts                # Extended with new domain keys
│
└── app/
    └── property/
        └── [propertyId]/
            └── dashboard/
                └── index.tsx       # Renders LovableMstDashboard
```

---

## 11. Comparison Summary

| Aspect | Current | Target |
|--------|---------|--------|
| **Cache source of truth** | Local `useState` | React Query cache |
| **Persistence** | AsyncStorage (parallel, ignored) | MMKV (integrated, automatic) |
| **Cache stores** | `Date.now()` timestamps | Actual server data |
| **Render on navigation back** | Full spinner (1-3s) | Instant (< 100ms) |
| **Cache hit behavior** | Skips fetch → infinite loading | Returns data instantly |
| **Background refresh** | None | Automatic stale-while-revalidate |
| **Offline support** | Broken (no data available) | Cache-first with offline mode |
| **Mutation invalidation** | Manual (none implemented) | Automatic via `invalidateQueries` |
| **Optimistic updates** | Local state (inconsistent) | `queryClient.setQueryData` |
| **Property isolation** | Partial (AsyncStorage has property check) | Complete (query key includes propertyId) |
| **Number of cache systems** | 3 (RQ + AsyncStorage + Zustand) | 1 (React Query + MMKV) |
| **Code per screen** | ~30 lines of cache boilerplate | ~5 lines of hook usage |

---

## 12. Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Dashboard render time (cached) | 1-3s | < 200ms | React DevTools Profiler |
| Dashboard render time (cold) | 1-3s | 1-3s | No regression acceptable |
| Navigation back spinner frequency | 50-100% | 0% | Manual testing |
| Infinite loading incidents | Frequent | Zero | Error monitoring |
| Cache systems per screen | 2-3 | 1 | Code review |
| Lines of cache boilerplate | ~30 | ~5 | Code review |
| Time to implement per screen | N/A | < 30 min | Developer estimate |

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Server State** | Data that lives on the server and is fetched via API (tickets, users, properties). |
| **Client State** | Data that lives only in the client (UI flags, modal visibility, filter selections). |
| **Cache Hit** | Query finds data in React Query cache for its key. |
| **Cache Miss** | Query finds no data in cache. Triggers fetch. |
| **Stale** | Cache data is older than `staleTime` (5 min). Still rendered, but refetched in background. |
| **Fresh** | Cache data is newer than `staleTime`. Rendered without refetch. |
| **gcTime** | Time before inactive cache entries are garbage collected (24 hr). |
| **Hydration** | Restoring persisted cache from MMKV to React Query memory on app start. |
| **Optimistic Update** | Updating cache before API confirms, for instant UI feedback. |
| **Invalidation** | Marking cache entries as stale so they refetch on next use. |
