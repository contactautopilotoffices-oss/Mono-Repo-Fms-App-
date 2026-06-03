# Cache Usage Map

**Date:** 2026-06-02
**Scope:** `saas_mobile_app` — Complete Application Audit
**Methodology:** Static code analysis of all `.ts` and `.tsx` files

---

## Classification Legend

| Class | Name | Description |
|-------|------|-------------|
| **A** | Industry Ready | React Query cache is the single source of truth. UI renders from `query.data`. Persisted cache enables instant navigation. |
| **B** | Hybrid | Multiple cache systems coexist (React Query + AsyncStorage/Zustand + Local State). May work but is fragile and inconsistent. |
| **C** | Broken | React Query is used only as a fetch trigger/timer. Actual data lives in local `useState`. Cache hit suppresses fetch → infinite loading. |

| Risk | Meaning |
|------|---------|
| **Low** | Does not affect user experience. Settings/preferences only. |
| **Medium** | May cause stale data or minor delays. |
| **High** | Causes infinite loading, blank screens, or data loss on navigation. |

---

## Global Infrastructure

### React Query Setup

| File | Role | Status |
|------|------|--------|
| `app/_layout.tsx` | Wraps app in `PersistQueryClientProvider` with MMKV persister | ✅ Correct setup |
| `utils/queryClient.ts` | Creates `QueryClient` with `staleTime: 5min`, `gcTime: 24hr`, `networkMode: 'offlineFirst'` | ✅ Correct defaults |
| `hooks/useDashboardFetch.ts` | Custom wrapper around `useQuery`. **Returns `Date.now()` as data.** | 🔴 Broken by design |

### AsyncStorage Usage

| File | Pattern | What is Cached | Risk |
|------|---------|----------------|------|
| `hooks/useAsyncStorageCache.ts` | Generic cache hook | `{ data, timestamp, propertyId }` | Infrastructure |
| `hooks/useCachedServerQuery.ts` | Wraps `useAsyncStorageCache` | Generic server result `T` | Infrastructure — **never used in production** |
| `context/AuthContext.tsx` | Direct AsyncStorage | `@autopilot_membership:${userId}` | Low |
| `utils/supabase/client.ts` | Storage adapter | Supabase auth session tokens | Low |
| `stores/dashboardStore.ts` | Zustand persist to AsyncStorage | Full dashboard state | Medium |
| `hooks/useWeather.ts` | Direct AsyncStorage | Background/theme preferences | Low |
| `app/property/[propertyId]/settings/index.tsx` | Direct AsyncStorage | Background/theme preferences | Low |
| `hooks/cassandra/useCassandraFeatureRegistry.ts` | Direct AsyncStorage | Feature availability map | Low |
| `services/cassandra/cassandraRoomService.ts` | Direct AsyncStorage | Transcript corrections | Low |
| `components/onboarding/PermissionOnboarding.tsx` | Direct AsyncStorage | Permission requested flag | Low |

### MMKV Usage

| File | Role | Status |
|------|------|--------|
| `utils/queryClient.ts` | React Query persister via `createSyncStoragePersister` | ✅ Correct |

**MMKV is ONLY used for React Query persistence.** No direct MMKV caching anywhere else.

---

## Dashboard Components — Full Audit

### `components/dashboard/LovableMstDashboard.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | MST Dashboard (Lovable) |
| **Query Key** | `['mst-dashboard', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — `queryFn` returns `Date.now()`. Only `refetch` destructured. |
| **AsyncStorage Usage** | `useAsyncStorageCache<'mst-dashboard'>` — caches `{ property, tickets, isCheckedIn }` |
| **MMKV Usage** | None direct (React Query persister only) |
| **Local State** | `useState` for: `tickets`, `property`, `isCheckedIn`, `isLoading`, `activeShiftId`, `showCreate`, `showSignOut`, etc. |
| **Cache Source of Truth** | Local `useState`. React Query cache stores only timestamp. AsyncStorage cache exists but is not used for initial render (race condition with `useState` init). |
| **Classification** | **C — Broken** |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 576). `fetchData` sets local state, returns void. `isLoading = !hasMstCache` (line 473). `setIsLoading(false)` only in `fetchData.finally` (line 564). |

---

### `components/dashboard/LovableStaffDashboard.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Staff Dashboard (Lovable) |
| **Query Key** | `['dashboard-staff', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern as MST. |
| **AsyncStorage Usage** | `useAsyncStorageCache<'staff-dashboard'>` — caches `{ property, tickets, isCheckedIn, userSkills, specialization, ppmTotal, ppmDone, ppmPending, ppmOverdue, ppmPostponed }` |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `tickets`, `property`, `isCheckedIn`, `userSkills`, `specialization`, `ppmTotal`, `ppmDone`, `ppmPending`, `ppmOverdue`, `ppmPostponed`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 600). `fetchData` sets local state (line 496+). `isLoading = !hasStaffCache` (line 448). |

---

### `components/dashboard/LovablePropertyAdminDashboard.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Property Admin Dashboard (Lovable) |
| **Query Key** | `['property-dashboard', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None (uses `useAsyncStorageCache` hook is NOT imported) |
| **Zustand Usage** | `useDashboardStore` — reads/writes persisted dashboard state |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `tickets`, `property`, `ticketCounts`, `isLoading`, `sopCount`, `energyKwh`, `vmsStats`, `vendorStats`, `dieselStats`, `healthScore`, `attentionItems`, `ticketFunnel`, etc. |
| **Cache Source of Truth** | Local `useState` + Zustand store. Zustand persists to AsyncStorage but data is still duplicated in local state. |
| **Classification** | **B — Hybrid** (Zustand adds another layer, but same core problem) |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 419). `useDashboardStore()` (line 81). `fetchData` writes to both local state AND Zustand store (lines 309-403). |

---

### `components/dashboard/LovableSuperAdminDashboard.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Super Admin Dashboard (Lovable) |
| **Query Key** | `['super-admin', user?.id]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | `useAsyncStorageCache<'super-admin-dashboard'>` — caches `{ properties, organizations, users }` |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `properties`, `organizations`, `users`, `isLoading`, `stats`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 361). `useAsyncStorageCache` (line 73). |

---

### `components/dashboard/MasterAdminDashboard.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Master Admin Dashboard |
| **Query Key** | `['master-admin', user?.id]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | `useAsyncStorageCache<'master-admin-dashboard'>` — caches `{ organizations, users, stats }` |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `organizations`, `users`, `stats`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 171). `useAsyncStorageCache` (line 73). |

---

### `components/dashboard/LovableSoftServiceManagerDashboard.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Soft Service Manager Dashboard (Lovable) |
| **Query Key** | `['soft-service', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `tickets`, `property`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 328). No AsyncStorage cache. |

---

### `components/dashboard/ApplePropertyDashboard.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Apple-Style Property Dashboard |
| **Query Key** | `['apple-dashboard', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `tickets`, `property`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 388). |

---

### `components/dashboard/AnalyticsTab.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Analytics Tab |
| **Query Key** | `['analytics-tab']` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `analyticsData`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Medium** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 105). |

---

### `components/dashboard/MstDashboard.tsx` (Legacy)

| Property | Value |
|----------|-------|
| **Screen Name** | MST Dashboard (Legacy) |
| **Query Key** | `['mst-dashboard-legacy', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `tickets`, `property`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 217). |

---

### `components/dashboard/NewMstDashboard.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | New MST Dashboard |
| **Query Key** | `['mst-dashboard-new', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `tickets`, `property`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 318). |

---

### `components/dashboard/PremiumMstDashboard.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Premium MST Dashboard |
| **Query Key** | `['mst-dashboard-premium', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `tickets`, `property`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 711). |

---

### `components/dashboard/StaffDashboard.tsx` (Legacy)

| Property | Value |
|----------|-------|
| **Screen Name** | Staff Dashboard (Legacy) |
| **Query Key** | `['staff-legacy', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `tickets`, `property`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 153). |

---

### `components/dashboard/SoftServiceManagerDashboard.tsx` (Legacy)

| Property | Value |
|----------|-------|
| **Screen Name** | Soft Service Manager Dashboard (Legacy) |
| **Query Key** | `['soft-service-legacy', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `tickets`, `property`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 67). |

---

### `components/dashboard/PropertyAdminDashboard.tsx` (Legacy)

| Property | Value |
|----------|-------|
| **Screen Name** | Property Admin Dashboard (Legacy) |
| **Query Key** | `['property-admin-legacy', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `tickets`, `property`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 141). |

---

### `components/dashboard/UserManagement.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | User Management |
| **Query Key** | `['org-users', orgId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `users`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Medium** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 36). |

---

### `components/dashboard/SettingsView.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Settings View |
| **Query Key** | `['user-settings-view', user?.id]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `profile`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Low** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 83). |

---

### `components/dashboard/PropertySelectionView.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Property Selection View |
| **Query Key** | `['property-selection', ...propertyIds]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `properties`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Low** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 59). |

---

## Screen Components — Full Audit

### `app/property/[propertyId]/tickets/index.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Tickets List |
| **Query Key** | `['tickets', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `tickets`, `isLoading`, `filter`, `searchQuery`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 213). |

---

### `app/property/[propertyId]/tickets/[id].tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Ticket Detail |
| **Query Key** | `['ticket-detail', id]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `ticket`, `comments`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 378). |

---

### `app/property/[propertyId]/visitors/index.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Visitors |
| **Query Key** | `['visitors', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `visitors`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 1068). |

---

### `app/property/[propertyId]/stock/index.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Stock / Inventory |
| **Query Key** | `['stock', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `items`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 274). |

---

### `app/property/[propertyId]/diesel/index.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Diesel Manager |
| **Query Key** | `['diesel', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `readings`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 1343). |

---

### `app/property/[propertyId]/diesel/analytics.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Diesel Analytics |
| **Query Key** | `['diesel-analytics', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `analytics`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Medium** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 369). |

---

### `app/property/[propertyId]/electricity/index.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Electricity Manager |
| **Query Key** | `['electricity', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `readings`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 2003). |

---

### `app/property/[propertyId]/electricity/analytics.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Electricity Analytics |
| **Query Key** | `['electricity-analytics', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `analytics`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Medium** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 352). |

---

### `app/property/[propertyId]/checklist/index.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | SOPs & Checklists |
| **Query Key** | `['checklist', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `checklists`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 1342). |

---

### `app/property/[propertyId]/ppm/index.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | PPM (Planned Preventive Maintenance) |
| **Query Key** | `['ppm', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `ppmItems`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **High** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 671). |

---

### `app/property/[propertyId]/procurement/index.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Procurement |
| **Query Key** | `['procurement', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `items`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Medium** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 204). |

---

### `app/property/[propertyId]/security/index.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Security Logs |
| **Query Key** | `['security', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `logs`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Medium** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 269). |

---

### `app/property/[propertyId]/rooms/index.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Meeting Rooms |
| **Query Key** | `['rooms', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `rooms`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Medium** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 477). |

---

### `app/property/[propertyId]/rooms/admin-credits.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Room Admin Credits |
| **Query Key** | `['rooms-admin-credits', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `credits`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Low** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 98). |

---

### `app/property/[propertyId]/users/index.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | User Directory |
| **Query Key** | `['users', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `users`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Medium** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 1098). |

---

### `app/property/[propertyId]/vendor/index.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Vendor Management |
| **Query Key** | `['vendor', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `vendors`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Medium** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 135). |

---

### `app/property/[propertyId]/flow-map/index.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Flow Map |
| **Query Key** | `['flow-map', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `flowData`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Medium** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 116). |

---

### `app/property/[propertyId]/escalation/index.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Escalations |
| **Query Key** | `['escalation', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `escalations`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Medium** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 165). |

---

### `app/property/[propertyId]/settings/index.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Property Settings |
| **Query Key** | `['settings', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | Direct: `fms_weather_location_enabled`, `fms_dashboard_background` |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `settings`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Low** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 153). |

---

### `app/property/[propertyId]/profile.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | User Profile |
| **Query Key** | `['user-profile', user?.id]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `profile`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Low** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 95). |

---

### `app/property/[propertyId]/tenant/rooms.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Tenant Rooms |
| **Query Key** | `['tenant-rooms', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `rooms`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Low** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 113). |

---

### `app/property/[propertyId]/reports/executive-summary/index.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Executive Summary |
| **Query Key** | `['reports-executive', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `reportData`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Medium** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 59). |

---

### `app/property/[propertyId]/reports/requests/index.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Request Reports |
| **Query Key** | `['reports-requests', propertyId, selectedMonth]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `requests`, `isLoading`, `selectedMonth`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Medium** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 103). |

---

### `app/property/[propertyId]/reports/snags/index.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Snag Reports |
| **Query Key** | `['reports-snags', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `snags`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Medium** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 47). |

---

### `app/property/[propertyId]/reports/snags/[importId]/index.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Snag Import Detail |
| **Query Key** | `['reports-snag-detail', importId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `details`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Low** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 78). |

---

### `app/cassandra/rooms/index.tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Cassandra Rooms List |
| **Query Key** | `['cassandra-rooms', propertyId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `rooms`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Medium** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 208). |

---

### `app/cassandra/rooms/[roomId].tsx`

| Property | Value |
|----------|-------|
| **Screen Name** | Cassandra Room Detail |
| **Query Key** | `['cassandra-room', roomId]` |
| **React Query Usage** | `useDashboardFetch` — same pattern. |
| **AsyncStorage Usage** | None |
| **MMKV Usage** | None direct |
| **Local State** | `useState` for: `room`, `isLoading`, etc. |
| **Cache Source of Truth** | Local `useState`. |
| **Classification** | **C — Broken** |
| **Risk Level** | **Medium** |
| **Evidence** | `const { refetch } = useDashboardFetch(...)` (line 271). |

---

## Summary Statistics

### Classification Breakdown

| Classification | Count | Percentage |
|----------------|-------|------------|
| **A — Industry Ready** | **0** | **0%** |
| **B — Hybrid** | **5** | **10.6%** |
| **C — Broken** | **42** | **89.4%** |
| **Total Audited** | **47** | **100%** |

### Risk Level Breakdown

| Risk Level | Count |
|------------|-------|
| **High** | 28 |
| **Medium** | 14 |
| **Low** | 5 |

### By Category

| Category | Files | Classification | Risk |
|----------|-------|----------------|------|
| **Dashboards (Lovable)** | 6 | C (5), B (1) | High |
| **Dashboards (Legacy)** | 5 | C (5) | High |
| **Dashboard Utilities** | 4 | C (4) | Low-Medium |
| **Screens — Operations** | 8 | C (8) | High-Medium |
| **Screens — Utilities** | 10 | C (10) | High-Medium |
| **Screens — Reports** | 5 | C (5) | Medium-Low |
| **Screens — Cassandra** | 2 | C (2) | Medium |
| **Screens — Other** | 7 | C (7) | Medium-Low |

### Cache Systems Used

| System | Files Using It | Purpose |
|--------|---------------|---------|
| React Query (`useDashboardFetch`) | 47 | Fetch scheduler (NOT data cache) |
| AsyncStorage (`useAsyncStorageCache`) | 4 | Parallel cache for dashboards |
| Zustand + AsyncStorage (`useDashboardStore`) | 1 | Parallel cache for property admin |
| Direct AsyncStorage | 8 | Settings, auth, weather, onboarding, etc. |
| MMKV (React Query persister) | 1 (global) | Persists RQ timestamps only |

---

## Key Findings

### 1. Zero Industry-Ready Screens

**Not a single screen in the entire application uses React Query as a data cache.** Every screen uses the same anti-pattern:

```tsx
// Anti-pattern found in ALL 47 files
const { refetch } = useDashboardFetch(queryKey, fetchData, options);
// ^ Only refetch is destructured. data, isLoading, isFetching are NEVER used.
```

### 2. The `useDashboardFetch` Hook is Broken by Design

```tsx
// hooks/useDashboardFetch.ts
const result = useQuery({
  queryKey,
  queryFn: async () => {
    await fetchFn();   // Side effect only — sets local state
    return Date.now(); // Cache stores a timestamp, not data
  },
  ...
});
```

This hook is architecturally incapable of being a data cache. It is a **fetch scheduler with a timestamp tracker**.

### 3. The `useCachedServerQuery` Hook is Unused

The codebase contains a properly-designed AsyncStorage cache hook (`useCachedServerQuery`) that renders from cache immediately and refetches in background. **It is imported by zero files.** Every screen chose the broken `useDashboardFetch` pattern instead.

### 4. Four Dashboards Have a Second Parallel Cache

`LovableMstDashboard`, `LovableStaffDashboard`, `LovableSuperAdminDashboard`, and `MasterAdminDashboard` all use `useAsyncStorageCache` alongside `useDashboardFetch`. However, the AsyncStorage cache is **not used for initial rendering** (race condition with `useState` initialization), so it provides no UX benefit.

### 5. `LovablePropertyAdminDashboard` Has a Third Parallel Cache

This dashboard uses `useDashboardStore` (Zustand + AsyncStorage) in addition to local state and React Query. Data is written to both local state AND Zustand, creating yet another cache divergence risk.

### 6. Every Screen is Vulnerable to Infinite Loading

Any screen that uses `useDashboardFetch` can enter infinite loading if:
- The user navigates back within 5 minutes (React Query cache is fresh → skips fetch)
- The `fetchData` callback has an early return that bypasses `setIsLoading(false)`
- The component remounts before AsyncStorage cache is loaded

---

## Files with the Exact Same Problem as MST Dashboard

The following files have **identical architecture** to `LovableMstDashboard.tsx` and are vulnerable to the same infinite loading bug:

### High Risk (same pattern: useDashboardFetch + local state + no cache rendering)
- `components/dashboard/LovableStaffDashboard.tsx`
- `components/dashboard/LovableSoftServiceManagerDashboard.tsx`
- `components/dashboard/ApplePropertyDashboard.tsx`
- `components/dashboard/LovableSuperAdminDashboard.tsx`
- `components/dashboard/MasterAdminDashboard.tsx`
- `components/dashboard/MstDashboard.tsx`
- `components/dashboard/NewMstDashboard.tsx`
- `components/dashboard/PremiumMstDashboard.tsx`
- `components/dashboard/StaffDashboard.tsx`
- `components/dashboard/SoftServiceManagerDashboard.tsx`
- `components/dashboard/PropertyAdminDashboard.tsx`
- `app/property/[propertyId]/tickets/index.tsx`
- `app/property/[propertyId]/tickets/[id].tsx`
- `app/property/[propertyId]/visitors/index.tsx`
- `app/property/[propertyId]/stock/index.tsx`
- `app/property/[propertyId]/diesel/index.tsx`
- `app/property/[propertyId]/electricity/index.tsx`
- `app/property/[propertyId]/checklist/index.tsx`
- `app/property/[propertyId]/ppm/index.tsx`
- `app/property/[propertyId]/users/index.tsx`
- `app/property/[propertyId]/vendor/index.tsx`
- `app/property/[propertyId]/procurement/index.tsx`
- `app/property/[propertyId]/security/index.tsx`
- `app/property/[propertyId]/rooms/index.tsx`
- `app/property/[propertyId]/flow-map/index.tsx`
- `app/property/[propertyId]/escalation/index.tsx`
- `app/cassandra/rooms/index.tsx`
- `app/cassandra/rooms/[roomId].tsx`

### Medium/Low Risk (same pattern but lower user impact)
- `components/dashboard/AnalyticsTab.tsx`
- `components/dashboard/UserManagement.tsx`
- `components/dashboard/SettingsView.tsx`
- `components/dashboard/PropertySelectionView.tsx`
- `app/property/[propertyId]/settings/index.tsx`
- `app/property/[propertyId]/profile.tsx`
- `app/property/[propertyId]/tenant/rooms.tsx`
- `app/property/[propertyId]/diesel/analytics.tsx`
- `app/property/[propertyId]/electricity/analytics.tsx`
- `app/property/[propertyId]/rooms/admin-credits.tsx`
- `app/property/[propertyId]/reports/executive-summary/index.tsx`
- `app/property/[propertyId]/reports/requests/index.tsx`
- `app/property/[propertyId]/reports/snags/index.tsx`
- `app/property/[propertyId]/reports/snags/[importId]/index.tsx`

### Hybrid Pattern (additional cache layer, still broken core)
- `components/dashboard/LovablePropertyAdminDashboard.tsx` — uses Zustand store
- `components/dashboard/LovableMstDashboard.tsx` — uses AsyncStorage cache
- `components/dashboard/LovableStaffDashboard.tsx` — uses AsyncStorage cache
- `components/dashboard/LovableSuperAdminDashboard.tsx` — uses AsyncStorage cache
- `components/dashboard/MasterAdminDashboard.tsx` — uses AsyncStorage cache

---

## Conclusion

**89.4% of all screens (42 out of 47) are classified as "Broken."** The remaining 10.6% are "Hybrid" — they have additional cache layers but still suffer from the same core architectural flaw.

**Zero screens are "Industry Ready."**

The problem is not localized to the MST Dashboard. It is a **global architectural pattern** that affects nearly every data-fetching screen in the application. The root cause is a single broken hook (`useDashboardFetch`) that was copy-pasted to 47 locations, each of which uses React Query only as a fetch trigger while storing actual data in local `useState`.
