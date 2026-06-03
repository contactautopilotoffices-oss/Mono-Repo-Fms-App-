# React Query Migration Strategy

**Version:** 1.0
**Date:** 2026-06-02
**Scope:** `saas_mobile_app` — Module-by-module migration plan
**Status:** Design Document — Pending Approval

---

## Executive Summary

This document provides a module-by-module migration strategy from the broken `useDashboardFetch` pattern to the target React Query architecture. Each module is classified by tier, risk, and complexity. Migration is incremental — one module at a time, never a big-bang refactor.

---

## 1. Reusable Architecture (Phase 3 — Foundation)

Before migrating any module, we establish reusable hooks. All module-specific hooks build on these primitives.

### 1.1 Core Hook: `useServerQuery`

**File:** `hooks/useServerQuery.ts`

```typescript
import { useQuery, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';

export function useServerQuery<T>(
  queryKey: readonly string[],
  queryFn: () => Promise<T>,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>
): UseQueryResult<T> {
  return useQuery<T>({
    queryKey,
    queryFn,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 2,
    refetchOnWindowFocus: false,
    networkMode: 'offlineFirst',
    enabled: !!queryKey[queryKey.length - 1],
    ...options,
  });
}
```

### 1.2 Core Hook: `useServerMutation`

**File:** `hooks/useServerMutation.ts`

```typescript
import { useMutation, UseMutationOptions, UseMutationResult } from '@tanstack/react-query';

export function useServerMutation<TData, TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'>
): UseMutationResult<TData, Error, TVariables> {
  return useMutation<TData, Error, TVariables>({
    mutationFn,
    retry: 1,
    networkMode: 'offlineFirst',
    ...options,
  });
}
```

### 1.3 Property-Aware Query Factory

**File:** `hooks/queries/usePropertyQuery.ts`

```typescript
import { useServerQuery } from '@/hooks/useServerQuery';

interface PropertyQueryOptions<T> {
  propertyId: string;
  fetcher: (propertyId: string) => Promise<T>;
  staleTime?: number;
  enabled?: boolean;
}

export function usePropertyQuery<T>({
  propertyId,
  fetcher,
  staleTime,
  enabled = true,
}: PropertyQueryOptions<T>) {
  return useServerQuery<T>(
    ['property', propertyId, fetcher.name],  // namespace + property + operation
    () => fetcher(propertyId),
    { staleTime, enabled: enabled && !!propertyId }
  );
}
```

### 1.4 Property-Aware List Query Factory

**File:** `hooks/queries/usePropertyListQuery.ts`

```typescript
import { useServerQuery } from '@/hooks/useServerQuery';

interface PropertyListQueryOptions<T, F = Record<string, unknown>> {
  propertyId: string;
  fetcher: (propertyId: string, filters?: F) => Promise<T>;
  filters?: F;
  staleTime?: number;
  enabled?: boolean;
}

export function usePropertyListQuery<T, F = Record<string, unknown>>({
  propertyId,
  fetcher,
  filters,
  staleTime,
  enabled = true,
}: PropertyListQueryOptions<T, F>) {
  // Include filters hash in query key for cache isolation
  const filtersKey = filters ? JSON.stringify(filters) : 'none';
  
  return useServerQuery<T>(
    ['property', propertyId, fetcher.name, filtersKey],
    () => fetcher(propertyId, filters),
    { staleTime, enabled: enabled && !!propertyId }
  );
}
```

### 1.5 Property-Aware Detail Query Factory

**File:** `hooks/queries/usePropertyDetailQuery.ts`

```typescript
import { useServerQuery } from '@/hooks/useServerQuery';

interface PropertyDetailQueryOptions<T> {
  propertyId: string;
  itemId: string;
  fetcher: (propertyId: string, itemId: string) => Promise<T>;
  enabled?: boolean;
}

export function usePropertyDetailQuery<T>({
  propertyId,
  itemId,
  fetcher,
  enabled = true,
}: PropertyDetailQueryOptions<T>) {
  return useServerQuery<T>(
    ['property', propertyId, fetcher.name, itemId],
    () => fetcher(propertyId, itemId),
    { enabled: enabled && !!propertyId && !!itemId }
  );
}
```

### 1.6 Invalidation Helper

**File:** `utils/queryInvalidation.ts`

```typescript
import { queryClient } from '@/utils/queryClient';

export const invalidate = {
  dashboard: (propertyId: string) =>
    queryClient.invalidateQueries({ queryKey: ['mst-dashboard', propertyId] }),
  
  tickets: (propertyId: string) =>
    queryClient.invalidateQueries({ queryKey: ['tickets', propertyId] }),
  
  ticketDetail: (ticketId: string) =>
    queryClient.invalidateQueries({ queryKey: ['ticket-detail', ticketId] }),
  
  visitors: (propertyId: string) =>
    queryClient.invalidateQueries({ queryKey: ['visitors', propertyId] }),
  
  stock: (propertyId: string) =>
    queryClient.invalidateQueries({ queryKey: ['stock', propertyId] }),
  
  allForProperty: (propertyId: string) =>
    queryClient.invalidateQueries({ queryKey: ['property', propertyId] }),
  
  everything: () => queryClient.clear(),
};
```

---

## 2. Module Classification

### 2.1 Tier 1 — Highest User Impact

| Module | Files | Daily Usage | Current Risk |
|--------|-------|-------------|--------------|
| MST Dashboard | `LovableMstDashboard.tsx` | Very High | Infinite loading |
| FM Dashboard | `LovableStaffDashboard.tsx` | Very High | Infinite loading |
| Property Admin Dashboard | `LovablePropertyAdminDashboard.tsx` | Very High | Infinite loading + Zustand divergence |
| Tickets List | `app/property/[propertyId]/tickets/index.tsx` | Very High | Full reload every visit |
| Ticket Detail | `app/property/[propertyId]/tickets/[id].tsx` | Very High | Full reload every visit |

### 2.2 Tier 2 — Medium User Impact

| Module | Files | Daily Usage | Current Risk |
|--------|-------|-------------|--------------|
| Visitors | `app/property/[propertyId]/visitors/index.tsx` | High | Full reload |
| Inventory / Stock | `app/property/[propertyId]/stock/index.tsx` | High | Full reload |
| Rooms | `app/property/[propertyId]/rooms/index.tsx` | Medium | Full reload |
| Procurement | `app/property/[propertyId]/procurement/index.tsx` | Medium | Full reload |
| Security | `app/property/[propertyId]/security/index.tsx` | Medium | Full reload |
| PPM | `app/property/[propertyId]/ppm/index.tsx` | Medium | Full reload |

### 2.3 Tier 3 — Lower User Impact

| Module | Files | Daily Usage | Current Risk |
|--------|-------|-------------|--------------|
| Reports | 4 files | Low | Full reload |
| Analytics | `AnalyticsTab.tsx` | Low | Full reload |
| Vendors | `app/property/[propertyId]/vendor/index.tsx` | Low | Full reload |
| Users | `app/property/[propertyId]/users/index.tsx` | Low | Full reload |
| Cassandra | 2 files | Low | Full reload |
| Settings | `app/property/[propertyId]/settings/index.tsx` | Medium | Full reload |
| Diesel | 2 files | Medium | Full reload |
| Electricity | 2 files | Medium | Full reload |
| Checklist | `app/property/[propertyId]/checklist/index.tsx` | Medium | Full reload |
| Escalation | `app/property/[propertyId]/escalation/index.tsx` | Low | Full reload |
| Flow Map | `app/property/[propertyId]/flow-map/index.tsx` | Low | Full reload |
| Profile | `app/property/[propertyId]/profile.tsx` | Medium | Full reload |

---

## 3. Module-by-Module Migration Strategy

### 3.1 Tier 1 Modules

---

#### Module: MST Dashboard

| Attribute | Value |
|-----------|-------|
| **Files** | `components/dashboard/LovableMstDashboard.tsx` |
| **Current Pattern** | `useDashboardFetch` + `useAsyncStorageCache` + local `useState` |
| **Target Pattern** | `useServerQuery<DashboardData>` + local UI state only |
| **Risk Level** | Medium |
| **Migration Complexity** | Medium |
| **Expected Benefits** | Eliminates infinite loading, instant navigation back, removes 2 parallel cache systems |
| **Query Key** | `['mst-dashboard', propertyId]` |
| **Data Type** | `DashboardData { property, tickets, isCheckedIn }` |
| **Mutations** | `toggleShift` (optimistic cache update) |
| **Invalidation Triggers** | Ticket create/update/delete, shift toggle |
| **Estimated Effort** | 2-3 hours |

**Migration Steps:**
1. Create `hooks/queries/useDashboardData.ts`
2. Remove `useAsyncStorageCache` from `LovableMstDashboard.tsx`
3. Replace local data state with `useDashboardData` hook
4. Update `toggleShift` to use `queryClient.setQueryData`
5. Update loading logic to use `isLoading` from query
6. Test navigation back, cold start, shift toggle

---

#### Module: FM Dashboard (Staff)

| Attribute | Value |
|-----------|-------|
| **Files** | `components/dashboard/LovableStaffDashboard.tsx` |
| **Current Pattern** | `useDashboardFetch` + `useAsyncStorageCache` + local `useState` |
| **Target Pattern** | `useServerQuery<StaffDashboardData>` + local UI state only |
| **Risk Level** | Medium |
| **Migration Complexity** | Medium |
| **Expected Benefits** | Same as MST Dashboard |
| **Query Key** | `['staff-dashboard', propertyId]` |
| **Data Type** | `StaffDashboardData { property, tickets, isCheckedIn, userSkills, specialization, ppmStats }` |
| **Mutations** | `toggleShift` |
| **Invalidation Triggers** | Ticket create/update/delete, shift toggle |
| **Estimated Effort** | 2-3 hours |

---

#### Module: Property Admin Dashboard

| Attribute | Value |
|-----------|-------|
| **Files** | `components/dashboard/LovablePropertyAdminDashboard.tsx` |
| **Current Pattern** | `useDashboardFetch` + `useDashboardStore` (Zustand) + local `useState` |
| **Target Pattern** | `useServerQuery<PropertyDashboardData>` + local UI state only |
| **Risk Level** | High |
| **Migration Complexity** | High |
| **Expected Benefits** | Eliminates Zustand store (3rd cache system), instant render, simplified code |
| **Query Key** | `['property-dashboard', propertyId]` |
| **Data Type** | `PropertyDashboardData { tickets, ticketCounts, sopCount, energyKwh, vmsStats, vendorStats, dieselStats, healthScore, attentionItems, ticketFunnel }` |
| **Mutations** | Multiple (ticket create, settings update) |
| **Invalidation Triggers** | Ticket changes, SOP changes, energy readings, visitor changes |
| **Estimated Effort** | 4-6 hours |

**Special Considerations:**
- Zustand store (`useDashboardStore`) is used by `DashboardBackground.tsx` for `backgroundImage`
- `backgroundImage` is client state, NOT server state — should remain in Zustand or move to `useState`
- All OTHER fields in Zustand store are server state and should move to React Query

---

#### Module: Tickets List

| Attribute | Value |
|-----------|-------|
| **Files** | `app/property/[propertyId]/tickets/index.tsx` |
| **Current Pattern** | `useDashboardFetch` + local `useState` |
| **Target Pattern** | `useServerQuery<Ticket[]>` + filter state only |
| **Risk Level** | Low |
| **Migration Complexity** | Low |
| **Expected Benefits** | Instant render on navigation back, filters preserved in URL/state |
| **Query Key** | `['tickets', propertyId]` |
| **Data Type** | `Ticket[]` |
| **Mutations** | `createTicket`, `updateTicketStatus`, `deleteTicket` |
| **Invalidation Triggers** | Any ticket mutation |
| **Estimated Effort** | 1-2 hours |

**Migration Steps:**
1. Create `hooks/queries/useTickets.ts`
2. Replace local `tickets` state with `useTickets(propertyId)`
3. Keep filter/search/sort state as local UI state
4. Update `onRefresh` to use query's `refetch`
5. Update `RefreshControl` to use `isFetching`

---

#### Module: Ticket Detail

| Attribute | Value |
|-----------|-------|
| **Files** | `app/property/[propertyId]/tickets/[id].tsx` |
| **Current Pattern** | `useDashboardFetch` + local `useState` |
| **Target Pattern** | `useServerQuery<Ticket>` + local UI state (comments, modals) |
| **Risk Level** | Low |
| **Migration Complexity** | Low |
| **Expected Benefits** | Instant render when navigating between tickets, no full reload |
| **Query Key** | `['ticket-detail', ticketId]` |
| **Data Type** | `Ticket` |
| **Mutations** | `updateTicket`, `addComment`, `updateStatus`, `assignTicket` |
| **Invalidation Triggers** | Any ticket update, comment added |
| **Estimated Effort** | 1-2 hours |

---

### 3.2 Tier 2 Modules

---

#### Module: Visitors

| Attribute | Value |
|-----------|-------|
| **Files** | `app/property/[propertyId]/visitors/index.tsx` |
| **Current Pattern** | `useDashboardFetch` + local `useState` |
| **Target Pattern** | `useServerQuery<Visitor[]>` |
| **Risk Level** | Low |
| **Migration Complexity** | Low |
| **Expected Benefits** | Instant render on navigation back |
| **Query Key** | `['visitors', propertyId]` |
| **Data Type** | `Visitor[]` |
| **Mutations** | `checkInVisitor`, `checkOutVisitor` |
| **Invalidation Triggers** | Visitor check-in/out |
| **Estimated Effort** | 1-2 hours |

---

#### Module: Inventory / Stock

| Attribute | Value |
|-----------|-------|
| **Files** | `app/property/[propertyId]/stock/index.tsx` |
| **Current Pattern** | `useDashboardFetch` + local `useState` |
| **Target Pattern** | `useServerQuery<StockItem[]>` |
| **Risk Level** | Low |
| **Migration Complexity** | Low |
| **Expected Benefits** | Instant render on navigation back |
| **Query Key** | `['stock', propertyId]` |
| **Data Type** | `StockItem[]` |
| **Mutations** | `addStock`, `updateStock`, `deleteStock` |
| **Invalidation Triggers** | Stock mutation |
| **Estimated Effort** | 1-2 hours |

---

#### Module: Rooms

| Attribute | Value |
|-----------|-------|
| **Files** | `app/property/[propertyId]/rooms/index.tsx`, `admin-credits.tsx` |
| **Current Pattern** | `useDashboardFetch` + local `useState` |
| **Target Pattern** | `useServerQuery<Room[]>` / `useServerQuery<RoomCredits>` |
| **Risk Level** | Low |
| **Migration Complexity** | Low |
| **Expected Benefits** | Instant render on navigation back |
| **Query Key** | `['rooms', propertyId]` / `['rooms-admin-credits', propertyId]` |
| **Data Type** | `Room[]` / `RoomCredits` |
| **Mutations** | `bookRoom`, `cancelBooking` |
| **Invalidation Triggers** | Room booking changes |
| **Estimated Effort** | 1-2 hours per file |

---

#### Module: Procurement

| Attribute | Value |
|-----------|-------|
| **Files** | `app/property/[propertyId]/procurement/index.tsx` |
| **Current Pattern** | `useDashboardFetch` + local `useState` |
| **Target Pattern** | `useServerQuery<ProcurementItem[]>` |
| **Risk Level** | Low |
| **Migration Complexity** | Low |
| **Expected Benefits** | Instant render on navigation back |
| **Query Key** | `['procurement', propertyId]` |
| **Data Type** | `ProcurementItem[]` |
| **Mutations** | `createRequest`, `updateRequest`, `approveRequest` |
| **Invalidation Triggers** | Procurement mutation |
| **Estimated Effort** | 1-2 hours |

---

#### Module: Security

| Attribute | Value |
|-----------|-------|
| **Files** | `app/property/[propertyId]/security/index.tsx` |
| **Current Pattern** | `useDashboardFetch` + local `useState` |
| **Target Pattern** | `useServerQuery<SecurityLog[]>` |
| **Risk Level** | Low |
| **Migration Complexity** | Low |
| **Expected Benefits** | Instant render on navigation back |
| **Query Key** | `['security', propertyId]` |
| **Data Type** | `SecurityLog[]` |
| **Mutations** | `logIncident`, `updateLog` |
| **Invalidation Triggers** | Security log mutation |
| **Estimated Effort** | 1-2 hours |

---

#### Module: PPM

| Attribute | Value |
|-----------|-------|
| **Files** | `app/property/[propertyId]/ppm/index.tsx` |
| **Current Pattern** | `useDashboardFetch` + local `useState` |
| **Target Pattern** | `useServerQuery<PPMItem[]>` |
| **Risk Level** | Low |
| **Migration Complexity** | Low |
| **Expected Benefits** | Instant render on navigation back |
| **Query Key** | `['ppm', propertyId]` |
| **Data Type** | `PPMItem[]` |
| **Mutations** | `schedulePPM`, `completePPM`, `postponePPM` |
| **Invalidation Triggers** | PPM mutation |
| **Estimated Effort** | 1-2 hours |

---

### 3.3 Tier 3 Modules

---

#### Module: Reports

| Attribute | Value |
|-----------|-------|
| **Files** | 4 report files |
| **Current Pattern** | `useDashboardFetch` + local `useState` |
| **Target Pattern** | `useServerQuery<ReportData>` |
| **Risk Level** | Low |
| **Migration Complexity** | Low |
| **Expected Benefits** | Instant render on navigation back |
| **Query Keys** | `['reports-executive', propertyId]`, `['reports-requests', propertyId, month]`, `['reports-snags', propertyId]`, `['reports-snag-detail', importId]` |
| **Data Types** | Various report shapes |
| **Mutations** | None (read-only) |
| **Invalidation Triggers** | N/A |
| **Estimated Effort** | 1 hour per file |

---

#### Module: Analytics

| Attribute | Value |
|-----------|-------|
| **Files** | `components/dashboard/AnalyticsTab.tsx` |
| **Current Pattern** | `useDashboardFetch` + local `useState` |
| **Target Pattern** | `useServerQuery<AnalyticsData>` |
| **Risk Level** | Low |
| **Migration Complexity** | Low |
| **Expected Benefits** | Instant render on navigation back |
| **Query Key** | `['analytics-tab']` |
| **Data Type** | `AnalyticsData` |
| **Mutations** | None |
| **Estimated Effort** | 1 hour |

---

#### Module: Vendors

| Attribute | Value |
|-----------|-------|
| **Files** | `app/property/[propertyId]/vendor/index.tsx` |
| **Current Pattern** | `useDashboardFetch` + local `useState` |
| **Target Pattern** | `useServerQuery<Vendor[]>` |
| **Risk Level** | Low |
| **Migration Complexity** | Low |
| **Expected Benefits** | Instant render on navigation back |
| **Query Key** | `['vendor', propertyId]` |
| **Data Type** | `Vendor[]` |
| **Mutations** | `addVendor`, `updateVendor` |
| **Invalidation Triggers** | Vendor mutation |
| **Estimated Effort** | 1 hour |

---

#### Module: Users

| Attribute | Value |
|-----------|-------|
| **Files** | `app/property/[propertyId]/users/index.tsx`, `components/dashboard/UserManagement.tsx` |
| **Current Pattern** | `useDashboardFetch` + local `useState` |
| **Target Pattern** | `useServerQuery<User[]>` / `useServerQuery<OrgUser[]>` |
| **Risk Level** | Low |
| **Migration Complexity** | Low |
| **Expected Benefits** | Instant render on navigation back |
| **Query Keys** | `['users', propertyId]`, `['org-users', orgId]` |
| **Data Types** | `User[]`, `OrgUser[]` |
| **Mutations** | `inviteUser`, `updateRole`, `removeUser` |
| **Invalidation Triggers** | User mutation |
| **Estimated Effort** | 1 hour per file |

---

#### Module: Cassandra

| Attribute | Value |
|-----------|-------|
| **Files** | `app/cassandra/rooms/index.tsx`, `app/cassandra/rooms/[roomId].tsx` |
| **Current Pattern** | `useDashboardFetch` + local `useState` |
| **Target Pattern** | `useServerQuery<CassandraRoom[]>` / `useServerQuery<CassandraRoom>` |
| **Risk Level** | Low |
| **Migration Complexity** | Low |
| **Expected Benefits** | Instant render on navigation back |
| **Query Keys** | `['cassandra-rooms', propertyId]`, `['cassandra-room', roomId]` |
| **Data Types** | `CassandraRoom[]`, `CassandraRoom` |
| **Mutations** | `sendMessage`, `stageCorrection` |
| **Invalidation Triggers** | Message sent, correction staged |
| **Estimated Effort** | 1-2 hours |

---

#### Module: Settings

| Attribute | Value |
|-----------|-------|
| **Files** | `app/property/[propertyId]/settings/index.tsx` |
| **Current Pattern** | `useDashboardFetch` + local `useState` + direct AsyncStorage |
| **Target Pattern** | `useServerQuery<Settings>` + direct AsyncStorage for preferences |
| **Risk Level** | Low |
| **Migration Complexity** | Low |
| **Expected Benefits** | Settings render instantly; preferences (background, weather) stay in AsyncStorage |
| **Query Key** | `['settings', propertyId]` |
| **Data Type** | `Settings` |
| **Mutations** | `updateSettings` |
| **Invalidation Triggers** | Settings mutation |
| **Estimated Effort** | 1-2 hours |

**Note:** Direct AsyncStorage usage for `fms_dashboard_background` and `fms_weather_location_enabled` is CLIENT state, not server state. It should remain as-is.

---

#### Module: Diesel

| Attribute | Value |
|-----------|-------|
| **Files** | `index.tsx`, `analytics.tsx` |
| **Current Pattern** | `useDashboardFetch` + local `useState` |
| **Target Pattern** | `useServerQuery<DieselReading[]>` / `useServerQuery<DieselAnalytics>` |
| **Risk Level** | Low |
| **Migration Complexity** | Low |
| **Expected Benefits** | Instant render on navigation back |
| **Query Keys** | `['diesel', propertyId]`, `['diesel-analytics', propertyId]` |
| **Data Types** | `DieselReading[]`, `DieselAnalytics` |
| **Mutations** | `addReading` |
| **Invalidation Triggers** | Reading mutation |
| **Estimated Effort** | 1-2 hours |

---

#### Module: Electricity

| Attribute | Value |
|-----------|-------|
| **Files** | `index.tsx`, `analytics.tsx` |
| **Current Pattern** | `useDashboardFetch` + local `useState` |
| **Target Pattern** | `useServerQuery<ElectricityReading[]>` / `useServerQuery<ElectricityAnalytics>` |
| **Risk Level** | Low |
| **Migration Complexity** | Low |
| **Expected Benefits** | Instant render on navigation back |
| **Query Keys** | `['electricity', propertyId]`, `['electricity-analytics', propertyId]` |
| **Data Types** | `ElectricityReading[]`, `ElectricityAnalytics` |
| **Mutations** | `addReading` |
| **Invalidation Triggers** | Reading mutation |
| **Estimated Effort** | 1-2 hours |

---

#### Module: Checklist

| Attribute | Value |
|-----------|-------|
| **Files** | `app/property/[propertyId]/checklist/index.tsx` |
| **Current Pattern** | `useDashboardFetch` + local `useState` |
| **Target Pattern** | `useServerQuery<Checklist[]>` |
| **Risk Level** | Low |
| **Migration Complexity** | Low |
| **Expected Benefits** | Instant render on navigation back |
| **Query Key** | `['checklist', propertyId]` |
| **Data Type** | `Checklist[]` |
| **Mutations** | `completeChecklist`, `updateChecklist` |
| **Invalidation Triggers** | Checklist mutation |
| **Estimated Effort** | 1-2 hours |

---

#### Module: Profile

| Attribute | Value |
|-----------|-------|
| **Files** | `app/property/[propertyId]/profile.tsx` |
| **Current Pattern** | `useDashboardFetch` + local `useState` |
| **Target Pattern** | `useServerQuery<UserProfile>` |
| **Risk Level** | Low |
| **Migration Complexity** | Low |
| **Expected Benefits** | Instant render on navigation back |
| **Query Key** | `['user-profile', userId]` |
| **Data Type** | `UserProfile` |
| **Mutations** | `updateProfile` |
| **Invalidation Triggers** | Profile mutation |
| **Estimated Effort** | 1 hour |

---

## 4. Migration Order

### Sprint 1: Foundation + Proof of Concept
| Day | Task | Files |
|-----|------|-------|
| 1 | Create `useServerQuery`, `useServerMutation`, invalidation helpers | 3 new files |
| 1-2 | Migrate MST Dashboard (proof of concept) | `LovableMstDashboard.tsx` |
| 2-3 | Test, benchmark, fix issues | — |
| 3 | Approve or rollback | — |

### Sprint 2: Tier 1 Completion
| Day | Task | Files |
|-----|------|-------|
| 4 | Migrate FM Dashboard | `LovableStaffDashboard.tsx` |
| 5 | Migrate Property Admin Dashboard | `LovablePropertyAdminDashboard.tsx` |
| 6 | Migrate Tickets List | `tickets/index.tsx` |
| 7 | Migrate Ticket Detail | `tickets/[id].tsx` |
| 7 | Test all Tier 1 | — |

### Sprint 3: Tier 2 Completion
| Day | Task | Files |
|-----|------|-------|
| 8 | Migrate Visitors | `visitors/index.tsx` |
| 8 | Migrate Stock | `stock/index.tsx` |
| 9 | Migrate Rooms | `rooms/index.tsx`, `rooms/admin-credits.tsx` |
| 9 | Migrate Procurement | `procurement/index.tsx` |
| 10 | Migrate Security | `security/index.tsx` |
| 10 | Migrate PPM | `ppm/index.tsx` |

### Sprint 4: Tier 3 Completion
| Day | Task | Files |
|-----|------|-------|
| 11 | Migrate Reports (4 files) | Reports |
| 11 | Migrate Analytics | `AnalyticsTab.tsx` |
| 12 | Migrate Vendors, Users | `vendor/index.tsx`, `users/index.tsx` |
| 12 | Migrate Cassandra | `cassandra/rooms/*` |
| 13 | Migrate Utilities | `diesel/*`, `electricity/*`, `checklist/*`, `escalation/*`, `flow-map/*` |
| 13 | Migrate Profile, Settings | `profile.tsx`, `settings/index.tsx` |

### Sprint 5: Cleanup
| Day | Task |
|-----|------|
| 14 | Delete `useDashboardFetch.ts` |
| 14 | Delete `useAsyncStorageCache.ts` |
| 14 | Delete `stores/dashboardStore.ts` (if no longer used) |
| 14 | Update `signOut` to call `queryClient.clear()` |
| 14 | Add `useFocusEffect` for automatic background refresh |
| 14 | Final integration testing |

**Total Estimated Duration:** 3-4 weeks (1 developer, full-time)

---

## 5. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| **Breaking existing screens during migration** | Migrate one screen at a time. Test before moving to next. Old `useDashboardFetch` stays until all screens are migrated. |
| **MMKV cache corruption** | Add query key versioning: `['v1', 'mst-dashboard', propertyId]`. Bump version when data shape changes. |
| **Large data sets causing memory issues** | Use `select` option in `useServerQuery` to trim fields. Implement pagination for tickets (> 1000). |
| **Stale data after mutations** | Every mutation hook MUST invalidate related queries via `onSuccess`. |
| **Property switching leaks data** | Query keys ALWAYS include `propertyId`. Never use global keys for property-scoped data. |
| **Offline mode broken** | `networkMode: 'offlineFirst'` is already configured. Verify after each migration. |
| **TypeScript errors from generics** | Use `T = unknown` default. Add explicit type annotations in hook calls. |

---

## 6. Rollout Strategy

### Phase A: Proof of Concept (1 week)
- Implement foundation hooks
- Migrate MST Dashboard ONLY
- Benchmark and validate
- Go/No-Go decision

### Phase B: High-Impact Modules (1 week)
- Migrate all Tier 1 modules
- Daily testing
- Fix regressions immediately

### Phase C: Medium-Impact Modules (1 week)
- Migrate all Tier 2 modules
- Weekly integration testing

### Phase D: Low-Impact Modules + Cleanup (1 week)
- Migrate all Tier 3 modules
- Delete legacy hooks
- Add `useFocusEffect`
- Final QA

### Rollback Plan
- Each phase has a git branch
- If a phase fails, revert branch and fix issues
- No phase proceeds until previous phase is stable

---

## 7. Success Criteria Per Module

For every migrated module, verify:

- [ ] Screen loads on first visit
- [ ] Navigate away → navigate back → renders instantly (< 200ms)
- [ ] Pull-to-refresh works (shows indicator, updates data)
- [ ] Kill app → reopen → renders from cache (no spinner if cache exists)
- [ ] Mutations invalidate related queries
- [ ] No TypeScript errors
- [ ] No Metro bundling errors
- [ ] No console warnings
- [ ] No regression in existing functionality
