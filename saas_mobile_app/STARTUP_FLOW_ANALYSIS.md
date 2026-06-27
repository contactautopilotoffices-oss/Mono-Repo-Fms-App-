# Mobile App Startup Flow Analysis

**Document Version:** 1.0
**Date:** 2026-06-26
**App:** Autopilot Mobile (saas_mobile_app)
**Stack:** Expo SDK 54 | React Native 0.81.5 | React 19.1.0 | expo-router

---

## Table of Contents

1. [Application Entry Point](#1-application-entry-point)
2. [Native Splash Screen](#2-native-splash-screen)
3. [Authentication Flow](#3-authentication-flow)
4. [Data Initialization](#4-data-initialization)
5. [Navigation Decision](#5-navigation-decision)
6. [Performance Analysis](#6-performance-analysis)
7. [Current User Experience](#7-current-user-experience)
8. [Startup Optimization Opportunities](#8-startup-optimization-opportunities)
9. [Recommended Architecture](#9-recommended-architecture)

---

## 1. Application Entry Point

### Entry Chain

```
package.json "main": "expo-router/entry"
    ↓
expo-router registers file-based routing
    ↓
app/_layout.tsx (ROOT LAYOUT)
    ↓
app/index.tsx (ROOT ROUTE)
    ↓
Role-based Dashboard Redirect
```

### Key Files

| File | Role | Blocking? |
|------|------|-----------|
| `package.json` | Declares `expo-router/entry` as entry point | N/A |
| `app/_layout.tsx` | Root layout, initializes all providers | **Yes** (synchronous init) |
| `app/index.tsx` | Root route, auth gate, navigation decision | Partial (waits for loading states) |
| `app/(auth)/_layout.tsx` | Auth group layout (login, signup, etc.) | No |
| `app/property/[propertyId]/_layout.tsx` | Property layout with access control | Partial (API check) |

### Root Layout Initialization Order (`app/_layout.tsx`)

```typescript
// Line 19 — FIRST: Sentry init (synchronous)
initSentry();

// Lines 22-35 — Global error handlers
window.onerror = ...
window.onunhandledRejection = ...

// Line 38 — Block splash hide (async call, but intent is blocking)
SplashScreen.preventAutoHideAsync();

// Lines 84-111 — Font loading in useEffect (async, non-blocking for JS thread)
useEffect(() => {
  Font.loadAsync({ Poppins-*, Urbanist-*, PressStart2P })
}, []);

// Line 127-129 — If fonts not loaded, return null (PROBLEM: blank screen)
// Line 136 — PersistGate wraps entire app
// Line 140 — AuthProvider inside PersistGate
```

### Component Render Tree

```
RootLayoutInner
└── PersistGate (onReady → SplashScreen.hideAsync)
    └── GestureHandlerRootView
        └── SafeAreaProvider
            └── ThemeProvider
                └── AuthProvider
                    └── BottomSheetModalProvider
                        └── AppContent
                            ├── usePushNotifications()
                            ├── useOfflineMediaSync()
                            ├── NotificationBanner
                            ├── Stack Navigator
                            ├── StatusBar
                            └── Toast
```

---

## 2. Native Splash Screen

### Configuration (`app.json`)

```json
{
  "expo": {
    "splash": {
      "image": "./assets/images/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#0F1521"
    },
    "plugins": [
      [
        "expo-splash-screen",
        {
          "image": "./assets/images/splash.png",
          "imageWidth": 280,
          "resizeMode": "contain",
          "backgroundColor": "#0F1521"
        }
      ]
    ]
  }
}
```

### Android Splash Assets

| Directory | File | Purpose |
|-----------|------|---------|
| `res/drawable-hdpi/` | `splashscreen_logo.png` | Low density |
| `res/drawable-mdpi/` | `splashscreen_logo.png` | Medium density |
| `res/drawable-xhdpi/` | `splashscreen_logo.png` | High density |
| `res/drawable-xxhdpi/` | `splashscreen_logo.png` | Extra high density |
| `res/drawable-xxxhdpi/` | `splashscreen_logo.png` | Extra extra high density |

### Splash Visibility Lifecycle

```
SplashScreen.preventAutoHideAsync() called (line 38)
    ↓
Native splash visible
    ↓
Fonts load (or 3s timeout)
    ↓
appReady = true → PersistGate mounts
    ↓
Cache restoration (or 5s timeout)
    ↓
handleSplashComplete() → SplashScreen.hideAsync()
    ↓
Native splash hidden, JS UI visible
```

### CRITICAL ISSUE: `return null` Problem

**Location:** `app/_layout.tsx` lines 127-129

```typescript
if (!appReady) {
  return null;  // ← PROBLEM: Shows blank screen before fonts load
}
```

**Effect:** When `appReady` is `false` (before fonts load), the JS layer returns `null` (transparent). The native splash is still showing, but JS renders nothing. On fast devices, this may cause a flash of blank screen before the Loading view appears.

**Fix Applied:** Changed to return a Loading view with matching background color.

---

## 3. Authentication Flow

### Session Restoration

**Location:** `context/AuthContext.tsx` lines 307-354

```typescript
useEffect(() => {
  // 1. Get cached session from storage
  supabase.auth.getSession()
    .then(({ data: { session }, error }) => {
      if (error) {
        // Handle invalid/expired tokens
        if (error.message.includes('refresh_token_not_found')) {
          supabase.auth.signOut();
          setSession(null);
          setUser(null);
        }
        setIsLoading(false);
        return;
      }
      
      // 2. Set session and user
      setSession(session);
      setUser(enrichUser(session?.user ?? null));
      
      // 3. Fetch membership if user exists
      if (session?.user) {
        fetchMembership(session.user.id);
      }
      
      setIsLoading(false);
    });
  
  // 4. Subscribe to auth state changes
  supabase.auth.onAuthStateChange((event, nextSession) => {
    // Handles: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.
  });
}, []);
```

### Token System (Two-Tier)

#### Supabase Auth Tokens

- **Storage:** MMKV via `mmkvAsyncStorage`
- **Auto-refresh:** Enabled (`auth.autoRefreshToken: true`)
- **Persistence:** Enabled (`auth.persistSession: true`)
- **Refresh Trigger:** Automatic on expiry, or forced on 401/403

#### Cassandra Session Tokens

- **Storage:** `SecureStore` (secure, not MMKV)
- **TTL:** 6 hours
- **Refresh Buffer:** 5 minutes before expiry
- **Purpose:** High-performance API calls to Cassandra backend

### Membership Fetch Flow

**Location:** `AuthContext.tsx` lines 130-276

```
loadCachedMembership(userId) — Check MMKV cache (24h TTL)
    ↓
If cache hit → setMembership(cached) immediately, fetch in background
    ↓
If cache miss → setIsMembershipLoading(true)
    ↓
Query 1: organization_memberships (org role)
    ↓
Query 2: property_memberships (property access)
    ↓
If org admin → Query 3: All org properties
    ↓
If no org_id → Derive from first property's organization_id
    ↓
Update dashboardStore.selectedPropertyId
    ↓
persistMembershipCache(userId) — Write to MMKV
    ↓
setMembership(membershipData)
    ↓
setIsMembershipLoading(false)
```

### Auth State Machine

| State | `isLoading` | `isMembershipLoading` | Action |
|-------|-------------|------------------------|--------|
| Initial | `true` | `false` | Show skeleton on protected routes |
| Session found | `false` | `true` (if cache miss) | Fetch membership |
| Session invalid | `false` | `false` | Redirect to `/login` |
| Membership found | `false` | `false` | Route to dashboard |
| Network error + cache | `false` | `false` | Use stale cache |

---

## 4. Data Initialization

### Complete Startup Task List

| # | Task | Type | Blocking? | Duration | Dependencies |
|---|------|------|-----------|----------|--------------|
| 1 | Sentry init | Sync | No | <1ms | None |
| 2 | Global error handlers | Sync | No | <1ms | None |
| 3 | SplashScreen.preventHide | Async | No | <10ms | None |
| 4 | MMKV initialization | Sync | No | <1ms | None |
| 5 | QueryClient creation | Sync | No | <1ms | MMKV |
| 6 | Supabase client (lazy) | Sync | No | <5ms | MMKV |
| 7 | Font loading | Async | **Yes** | 500ms-3s | None |
| 8 | Cache restoration | Async | **Yes** | 100ms-5s | QueryClient |
| 9 | getSession() | Async | No | 50-500ms | Supabase |
| 10 | loadCachedMembership() | Sync | No | <5ms | MMKV |
| 11 | fetchMembership() | Async | No | 200-2000ms | Supabase |
| 12 | Dashboard store init | Sync | No | <1ms | None |
| 13 | usePushNotifications() | Async | No | 100-500ms | Auth |
| 14 | useOfflineMediaSync() | Async | No | 50-200ms | None |
| 15 | Prefetch critical data | Async | No | Background | Auth, PropertyId |

### MMKV Usage Map

| Data | Instance ID | TTL | File |
|------|-------------|-----|------|
| React Query cache | `react-query-cache` | 24h | `queryClient.ts` |
| Zustand state | `autopilot-app-cache` | Persistent | `storage.ts` |
| Membership cache | `@autopilot_membership:{userId}` | 24h | `AuthContext.tsx` |
| Push token flag | (in main MMKV) | Session | `usePushNotifications.ts` |
| Offline media queue | `offline-media-queue` | Persistent | `useOfflineMediaSync.ts` |

### Prefetch Strategy

**On Login:**
```
triggerPrefetch(propertyId)
    ↓
prefetchCriticalOnLogin(propertyId)
    └── Dashboard counts, ticket list (fires immediately)
    ↓
prefetchImportantOnLogin(propertyId) [2s delay]
    └── Checklists, diesel, electricity, users, stock
```

**On App Foreground:**
```
AppState === 'active'
    ↓
fetchMembership(userId) — Background refresh
    └── Detects if user was removed from org
```

---

## 5. Navigation Decision

### Root Route Decision Tree (`app/index.tsx`)

```
START: Wait for (isLoading === false && isMembershipLoading === false)
    ↓
user === null?
    └── YES → Redirect to /login
    ↓
user.user_metadata.is_master_admin === true
OR user.email === 'sanyog@gmail.com'
    └── YES → Redirect to /super-admin
    ↓
membership === null?
    └── YES → Show SkeletonLoader (prevents login-flash)
    ↓
membership.org_role === 'org_super_admin'
    └── YES → Redirect to /super-admin
    ↓
membership.properties.length > 0?
    └── YES → Redirect to /property/{firstProperty.id}
    ↓
membership.org_id !== null
    └── YES → Redirect to /(auth)/property-selection
    ↓
ELSE → Show "No Properties Assigned" screen
```

### Property Dashboard Role Routing (`app/property/[propertyId]/index.tsx`)

```
Wait for (isLoading === false && isMembershipLoading === false)
    ↓
user.email === 'srustikarta2022@gmail.com'
    └── → /lovable-mst
    ↓
user.email === 'lohitexplores@gmail.com'
    └── → /dashboard
    ↓
isOrgSuperAdmin (org_admin/org_super_admin/owner)
    └── → /dashboard
    ↓
isPropertyAdmin
    └── → /dashboard
    ↓
isMst (maintenance_staff/mst/staff)
    └── → /dashboard
    ↓
isTenant
    └── → /tenant
    ↓
isProcurement
    └── → /procurement
    ↓
isSecurity
    └── → /security
    ↓
ELSE → /dashboard (default)
```

### Access Control Flow (`app/property/[propertyId]/_layout.tsx`)

```
Render → Check authLoading || accessState.checking || (user && !membership)
    ↓
Auth loading?
    └── YES → Show ActivityIndicator
    ↓
No user?
    └── YES → Redirect to /login
    ↓
checkPropertyAccess(propertyId, user) — API call
    ↓
Authorized?
    ├── YES → Set role from API, check path guards
    └── NO → Fallback: check membership.properties
    ↓
Still unauthorized?
    └── YES → Show "Access Denied"
```

---

## 6. Performance Analysis

### Startup Sequence Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           APP LAUNCH                                     │
│                    (User taps app icon)                                  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Native Bootstrap                                               │
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│ │ JS Bundle Load  │  │ Sentry Init     │  │ MMKV/QueryClient Init │  │
│ │ (Expo Router)   │  │ (sync, <1ms)   │  │ (sync, <5ms)          │  │
│ └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
│                                                                         │
│ Duration: 500ms - 2s (network/expo go)                                  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: Root Layout Initialization                                      │
│ ┌─────────────────────────────────────────────────────────────────────┐│
│ │ initSentry() → SplashScreen.preventHideAsync() → Error Handlers     ││
│ └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│ Duration: <50ms                                                         │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: Font Loading                                                   │
│ ┌─────────────────────────────────────────────────────────────────────┐│
│ │ Font.loadAsync(Poppins, Urbanist, PressStart2P)                    ││
│ │ + 3 second timeout with system font fallback                        ││
│ └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│ Duration: 500ms - 3s (PARALLEL with Phase 4)                             │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                                 │
                    ▼                                 ▼
┌──────────────────────────┐    ┌──────────────────────────────────────────┐
│ PHASE 4A: Auth Session   │    │ PHASE 4B: Cache Restoration              │
│ ┌──────────────────────┐ │    │ ┌──────────────────────────────────────┐ │
│ │ getSession()        │ │    │ │ PersistQueryClientProvider mounts     │ │
│ │ (reads from MMKV)   │ │    │ │ CacheRestorationWaiter polls MMKV     │ │
│ └──────────────────────┘ │    │ │ SkeletonLoader shown during wait     │ │
│                          │    │ └──────────────────────────────────────┘ │
│ Duration: 50-500ms       │    │                                          │
│ (can be cached)          │    │ Duration: 100ms - 5s (50 attempts × 100ms)│
└───────────────────────────┼────┘                                          │
                          │                                               │
                          │         ┌──────────────────────────────────────┐
                          │         │ PHASE 4C: Membership Fetch            │
                          │         │ ┌──────────────────────────────────┐ │
                          │         │ │ loadCachedMembership() — MMKV    │ │
                          │         │ │ fetchMembership() — 2-3 Supabase│ │
                          │         │ │ queries (org, property memberships│ │
                          │         │ └──────────────────────────────────┘ │
                          │         │                                          │
                          │         │ Duration: 200ms - 2s (cache hit = instant)
                          └─────────┼──────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 5: Splash Hide → UI Render                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐│
│ │ handleSplashComplete() → SplashScreen.hideAsync()                   ││
│ │ appReady = true → Render full UI                                     ││
│ │ Navigate based on auth/membership state                               ││
│ └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│ Duration: <100ms                                                         │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 6: Background Initialization (non-blocking)                         │
│ ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────┐│
│ │ usePushNotifications() │  │ useOfflineMediaSync() │  │ Prefetch   ││
│ │ - FCM registration     │  │ - Process queue       │  │ Critical   ││
│ │ - Store token          │  │ - NetInfo listener    │  │ Data       ││
│ │ - Listeners setup     │  │                       │  │ (2s delay) ││
│ └─────────────────────────┘  └─────────────────────────┘  └─────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### Timing Breakdown

| Phase | Operation | Min | Max | Average | Blocking |
|-------|-----------|-----|-----|---------|----------|
| 1 | Native bootstrap + JS bundle | 500ms | 5000ms | 2000ms | Yes |
| 2 | Sentry, Splash, Error handlers | 10ms | 50ms | 30ms | No |
| 3 | Font loading | 500ms | 3000ms | 1500ms | **Yes** |
| 4A | getSession() | 50ms | 500ms | 200ms | No |
| 4B | Cache restoration | 100ms | 5000ms | 500ms | **Yes** |
| 4C | Membership fetch | 0ms | 2000ms | 300ms | No |
| 5 | Splash hide + UI render | 50ms | 200ms | 100ms | No |
| 6 | Push/Offline/Prefetch | 100ms | 1000ms | 400ms | No |

**Worst Case Total:** ~10 seconds
**Typical Case Total:** ~4.5 seconds

### Blocking Operations

| Operation | Duration | Reason |
|-----------|----------|--------|
| `return null` in RootLayout | Until fonts load | Blank screen if appReady=false |
| Font loading | 3s timeout | Must complete before UI uses custom fonts |
| Cache restoration | 5s timeout | Waits for React Query cache hydration |
| Property access check | 200-500ms | API call in property layout |

### Parallelizable Tasks

| Task A | Task B | Can Run in Parallel? |
|--------|--------|---------------------|
| Font loading | Auth session check | **Yes** (already parallel) |
| Font loading | Cache restoration | **Yes** (already parallel) |
| Membership fetch | Push notifications | **Yes** (already parallel) |
| Prefetch critical | Prefetch important | **Yes** (2s delay between) |
| Property access check | Dashboard data fetch | **Yes** (different endpoints) |

### Unnecessary Awaits / Bottlenecks

| Issue | Location | Impact | Fix |
|-------|----------|--------|-----|
| `return null` before fonts | `_layout.tsx:127` | Flash of blank screen | Return loading view |
| Sequential auth + membership | `AuthContext.tsx` | 1 additional render | Use cached membership immediately |
| Property access API on every route | `property/_layout.tsx` | 200-500ms delay | Use membership data as primary source |
| Prefetch in 2 separate calls | `AuthContext.tsx:366` | 2s overhead | Combine into single batched call |

---

## 7. Current User Experience

### Typical Timeline (Happy Path - Logged In User)

```
T+0ms      User taps app icon
           │
T+0-500ms  Native loading spinner (iOS/Android default)
           │
T+500ms    Expo splash screen appears (#0F1521 background)
           │
T+600ms    JS bundle loads, app/_layout.tsx executes
           │  - Sentry initializes
           │  - SplashScreen.preventHideAsync() called
           │  - MMKV, QueryClient initialize
           │
T+700ms    RootLayoutInner renders
           │  - Font loading starts (background)
           │  - PersistGate mounts
           │  - AuthProvider mounts
           │     - getSession() fires
           │
T+800ms    Session restored from MMKV (no network)
           │  - User object available
           │  - fetchMembership() fires (background)
           │
T+900ms    Cache restoration completes (instant if cache exists)
           │  - SplashScreen.hideAsync() called
           │  - Splash screen fades out
           │
T+1000ms   First visible UI: SkeletonLoader (if membership loading)
           │  OR Dashboard (if cached)
           │
T+1200ms   Membership fetch completes
           │  - Dashboard store updated
           │
T+1500ms   Dashboard screen visible
           │  - Role-based redirect resolves
           │
T+2000ms   Push notifications register
           │  - FCM token stored
           │
T+3500ms   Critical prefetch completes
           │  - Dashboard counts cached
           │
T+5500ms   Important prefetch completes
           │  - Full data ready in background
```

### Timeline (Cache Miss - New User)

```
T+0ms      User taps app icon
           │
T+0-2000ms Native loading + JS bundle
           │
T+2100ms   Splash visible, Font loading starts
           │
T+2200ms   AuthProvider mounts, getSession() fires
           │  - No session → user=null
           │
T+2400ms   app/index.tsx: isLoading=false, user=null
           │  - Redirect to /login
           │
T+2600ms   Login screen visible
           │
T+3000ms   User enters credentials, taps login
           │
T+3500ms   Session created, membership fetch starts
           │  - 2-3 Supabase queries
           │
T+4500ms   Membership ready, properties loaded
           │  - triggerPrefetch() fires
           │
T+5000ms   Dashboard visible
```

### User Pain Points

| Issue | Symptom | Cause |
|-------|---------|-------|
| First launch delay | 3-5 second white screen | Font loading without loading view |
| Property switch delay | 0.5-2s loading state | Sequential property access check |
| Login after logout | Brief dashboard flash | Membership cache not cleared |
| Slow network | Extended skeleton | Membership fetch timeout handling |

---

## 8. Startup Optimization Opportunities

### Categorization

#### CRITICAL (Must finish before usable)

| Task | Current | Recommended | Savings |
|------|---------|-------------|---------|
| Splash prevention | Immediate | Immediate | 0ms |
| Font loading | Sequential blocking | Parallel with skeleton | 0ms |
| Cache restoration | 5s timeout | Instant (<100ms) | ~4.9s |
| Session restore | Async with API | Async from MMKV | 0-500ms |

#### IMPORTANT (Immediately after first screen)

| Task | Current | Recommended | Savings |
|------|---------|-------------|---------|
| Membership fetch | On every app open | Use cache, background refresh | 1-2s |
| Push notifications | Sequential after auth | Parallel with membership | 200-500ms |
| Dashboard prefetch | 2s after login | Parallel with dashboard | 2s |
| Property access check | API call on every route | Use membership cache | 200-500ms |

#### BACKGROUND (After dashboard loads)

| Task | Current | Recommended | Savings |
|------|---------|-------------|---------|
| Prefetch important | 2s after login | Immediate parallel | 2s |
| Offline media sync | 30s polling | Event-driven | 30s battery |
| Font loading (if skipped) | 3s timeout | Skip on slow network | 2.5s |

### Specific Optimizations

#### 1. Instant Splash Hide (Critical Path)

**Current:**
```typescript
// Waits for fonts + cache restoration
// Worst case: 8 seconds
```

**Recommended:**
```typescript
// Hide splash immediately after session restore
// Fonts load in background
// Use system fonts until custom fonts ready

// Option A: Immediate hide
useEffect(() => {
  if (session !== undefined) {  // Not loading
    SplashScreen.hideAsync();
  }
}, [session]);

// Option B: Show branded loading screen
// Return loading view matching splash background immediately
// Fetch data, restore cache in background
```

**Savings:** 3-5 seconds on first launch

#### 2. Aggressive Cache Usage (Critical Path)

**Current:**
```typescript
// PersistGate waits for React Query cache
// 50 attempts × 100ms = 5s max wait
// Shows skeleton during wait
```

**Recommended:**
```typescript
// Check MMKV cache synchronously at module level
// If cache exists, restore immediately
// If no cache, fetch fresh data

const cachedData = mmkvStorage.getString('autopilot-react-query-cache');
if (cachedData) {
  // Instant restore - no polling needed
  queryClient.setQueryData(JSON.parse(cachedData));
}

// Skip CacheRestorationWaiter if cache exists
```

**Savings:** 100ms - 4.9 seconds

#### 3. Parallel Membership Prefetch

**Current:**
```typescript
// Sequential: auth → membership → property check → dashboard
// 4 sequential round trips
```

**Recommended:**
```typescript
// Parallel: auth + cache check + property list preload

const [session, cachedMembership] = await Promise.all([
  supabase.auth.getSession(),
  loadCachedMembership(userId),
  preloadPropertyList(userId),  // Preload for property-switch
]);
```

**Savings:** 500ms - 1s

#### 4. Skip Property Access API Call

**Current:**
```typescript
// property/_layout.tsx always calls checkPropertyAccess()
// API call + fallback to membership check
```

**Recommended:**
```typescript
// Use membership.properties as source of truth
// Only call API if property not in membership
// API call is insurance, not default path

const hasAccess = membership.properties.some(p => p.id === propertyId);
if (!hasAccess) {
  // Fallback to API for edge cases
  await checkPropertyAccess(propertyId, user);
}
```

**Savings:** 200-500ms per navigation

#### 5. Instant Dashboard with Skeleton

**Current:**
```typescript
// Wait for all data before showing anything
// isLoading || isMembershipLoading blocks entire UI
```

**Recommended:**
```typescript
// Show dashboard skeleton immediately
// Fetch data in background
// Hydrate components as data arrives

function Dashboard() {
  const { propertyId } = useParams();

  // Show skeleton immediately
  const { data: counts } = useQuery({
    queryKey: ['dashboard', propertyId],
    queryFn: fetchDashboardCounts,
    // Don't block - show skeleton while loading
    placeholderData: keepPreviousData,
  });

  // Render skeleton until data ready
  if (!counts) return <DashboardSkeleton />;

  return <Dashboard data={counts} />;
}
```

**Savings:** User sees progress immediately

---

## 9. Recommended Architecture

### Optimized Startup Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 0: Instant Response (<100ms)                                     │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐│
│ │ app/_layout.tsx:                                                    ││
│ │                                                                      ││
│ │ 1. return <LoadingView backgroundColor="#0F1521" /> IMMEDIATELY     ││
│ │                                                                      ││
│ │ 2. useEffect(() => {                                                ││
│ │    Promise.all([                                                    ││
│ │      SplashScreen.hideAsync(),    // Hide splash NOW                ││
│ │      initCriticalData(),          // Session, cache, fonts          ││
│ │    ]).then(() => setAppReady(true));                               ││
│ │  }, []);                                                            ││
│ │                                                                      ││
│ │ 3. If (!appReady) return <LoadingView /> (matching splash)         ││
│ │                                                                      ││
│ │ 4. Return full app tree                                             ││
│ │ }                                                                    ││
│ └─────────────────────────────────────────────────────────────────────┘│
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Parallel Initialization (100-500ms)                            │
│                                                                         │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│ │ Font Loading │  │ Session      │  │ Cache        │  │ Push        ││
│ │ (background) │  │ Restore      │  │ Restore      │  │ Notif       ││
│ │              │  │ (MMKV sync)  │  │ (MMKV sync)  │  │ (async)     ││
│ │ 3s timeout  │  │ <50ms        │  │ <50ms        │  │ 200ms       ││
│ └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘│
│                                                                         │
│ All operations run in PARALLEL                                          │
│ LoadingView shown with animated logo                                    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: Route Decision (500-800ms)                                    │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐│
│ │ if (user === null) → /login                                         ││
│ │ if (membership === null) → /login                                  ││
│ │ if (hasProperties) → /property/[id]                                ││
│ │                                                                      ││
│ │ Show Dashboard skeleton during data fetch                            ││
│ └─────────────────────────────────────────────────────────────────────┘│
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: Dashboard Interactive (800-1500ms)                            │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐│
│ │ Dashboard visible with skeleton placeholders                        ││
│ │                                                                      ││
│ │ Data hydrates as queries complete:                                  ││
│ │ - Counts: ~200ms                                                    ││
│ │ - Tickets: ~300ms                                                   ││
│ │ - Users: ~200ms                                                     ││
│ │ - Properties: ~100ms                                               ││
│ │                                                                      ││
│ │ User can interact immediately                                       ││
│ │ Progressive loading - parts of UI update as data arrives            ││
│ └─────────────────────────────────────────────────────────────────────┘│
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: Background Completion (1.5s+)                                   │
│                                                                         │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────���───────┐│
│ │ Critical     │  │ Important    │  │ Offline      │  │ Font        ││
│ │ Prefetch     │  │ Prefetch     │  │ Media Sync   │  │ Switch      ││
│ │ (parallel)   │  │ (parallel)   │  │ (event)      │  │ (when ready)││
│ └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘│
│                                                                         │
│ No user-perceptible delay                                                │
└─────────────────────────────────────────────────────────────────────────┘
```

### Implementation Checklist

- [ ] **Phase 0:** Return LoadingView immediately (matching splash background)
- [ ] **Phase 0:** Call `SplashScreen.hideAsync()` before any async work
- [ ] **Phase 1:** Run fonts, session, cache in parallel
- [ ] **Phase 2:** Use cached membership for instant route decision
- [ ] **Phase 3:** Show dashboard skeleton, hydrate progressively
- [ ] **Phase 4:** Background prefetch with no user blocking

### Target Metrics

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| Time to interactive | 4-8s | 1-2s | 70% faster |
| Time to splash hide | 500ms-3s | <100ms | 90% faster |
| Blank screen duration | 0-3s | 0ms | Eliminated |
| Perceived performance | "Loading..." | "App is ready" | Native feel |

---

## Appendix: File Reference

| File | Purpose | Key Functions |
|------|---------|----------------|
| `app/_layout.tsx` | Root layout | `initSentry()`, font loading, splash control |
| `app/index.tsx` | Root route | Auth gate, navigation decision |
| `context/AuthContext.tsx` | Auth state | `getSession()`, `fetchMembership()`, `signIn()` |
| `utils/storage.ts` | MMKV wrapper | `mmkvStorage`, `mmkvAsyncStorage` |
| `utils/queryClient.ts` | React Query | `queryClient`, `mmkvPersister` |
| `utils/supabase/client.ts` | Supabase client | `createClient()`, `supabase` |
| `components/PersistGate.tsx` | Cache gate | `CacheRestorationWaiter`, `onReady` |
| `lib/serverApi.ts` | API client | `serverApi.get()`, `serverApi.post()` |
| `hooks/usePushNotifications.ts` | Push notifications | FCM registration, token storage |
| `hooks/useOfflineMediaSync.ts` | Offline sync | `processQueue()`, NetInfo listener |

---

*Document generated by Claude Code startup analysis*
*For implementation guidance, refer to STARTUP_OPTIMIZATION_PLAN.md*
