# APP READINESS REPORT — Top 25 Missing Items

> Compiled from 9 audit dimensions. Focus: "What would stop this app from becoming a world-class SaaS mobile product?"

---

## HOW TO READ THIS REPORT

| Priority | Definition |
|----------|------------|
| **P0** | Must fix before ANY production launch |
| **P1** | High impact, fix before scale (>1,000 users) |
| **P2** | Polish and differentiation |

---

## P0 — MUST FIX BEFORE LAUNCH

### 1. No Ticket Creation on Mobile
**Problem:** Users cannot create tickets from the mobile app. Must use web.
**Impact:** Core workflow broken for field workers, tenants, security guards.
**Effort:** 5 days
**Solution:** Build ticket creation flow with category, priority, description, photo upload, location.

---

### 2. Property Switch Cache Contamination
**Problem:** React Query cache is NOT cleared when user switches properties. Data from Property A leaks into Property B.
**Impact:** Security violation + data integrity failure.
**Effort:** 1 day
**Solution:**
```ts
// In property layout, invalidate on propertyId change
useEffect(() => {
  queryClient.invalidateQueries({ queryKey: ['property', oldPropertyId] });
}, [propertyId]);
```

---

### 3. No Offline Read Support
**Problem:** All screens show white screens or spinners when offline. Field workers in basements/remote areas have zero functionality.
**Impact:** Core use case (tenant reporting issue) is broken offline.
**Effort:** 3 days
**Solution:** Implement cache-first strategy with `networkMode: 'offlineFirst'` + "You're offline" banner. Queue writes for sync.

---

### 4. Keyboard Avoiding View Broken on Forms
**Problem:** Keyboard covers form inputs on nearly every form. Users can't see what they're typing.
**Impact:** Ticket creation, vendor entry, stock updates all broken.
**Effort:** 1 day
**Solution:** Wrap forms in `KeyboardAvoidingView` with `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}` + `ScrollView keyboardShouldPersistTaps="handled"`.

---

### 5. No Auth Session Caching
**Problem:** Every app launch re-validates session with Supabase (500ms-2s delay).
**Impact:** 2+ second white screen on every cold start.
**Effort:** 1 day
**Solution:** Cache auth state in MMKV. Validate async, show cached UI immediately.

---

### 6. FlatList (Not Virtualized) on Tickets + Visitors
**Problem:** Tickets and visitors use `FlatList` without pagination. 100+ items = memory crash + 60fps drops.
**Impact:** App becomes unresponsive with moderate data.
**Effort:** 2 days
**Solution:** Migrate to `FlashList` + add `limit` + `offset` pagination to queries.

---

### 7. No Pagination on Any List Query
**Problem:** All list queries fetch ALL rows. `SELECT * FROM tickets` with 10,000 rows = crash.
**Impact:** Becomes critical at 1,000+ users.
**Effort:** 2 days
**Solution:** Add `limit: 50` + cursor-based pagination on all list queries.

---

### 8. Reports Screen is Empty
**Problem:** All report screens are placeholders with no data visualization.
**Impact:** Product appears unfinished. Key value proposition (analytics) is missing.
**Effort:** 5 days
**Solution:** Build ticket analytics, energy reports, visitor analytics with charts.

---

### 9. No Sentry Source Maps
**Problem:** Sentry is initialized but source maps not uploaded on build. Crashes show mangled stack traces.
**Impact:** Can't debug production crashes.
**Effort:** 1 hour
**Solution:** Add Sentry source map upload to CI/CD build step.

---

### 10. No Staging Environment
**Problem:** No way to test changes without touching production.
**Impact:** Bugs ship directly to users. No QA environment.
**Effort:** 2 days
**Solution:** Clone Supabase project for staging. Add `STAGING_API_URL` env.

---

## P1 — HIGH IMPACT (Fix Before Scale)

### 11. No Biometric Lock
**Problem:** App unlocks with just app open. Anyone with device access can act as user.
**Impact:** Security risk for org admins.
**Effort:** 1 day
**Solution:** `expo-local-authentication` — Face ID / fingerprint gate after 5min background.

---

### 12. No Real-time Notifications
**Problem:** `NotificationBell` polls Supabase. Notifications appear 30-60s late.
**Impact:** SLA breaches, critical tickets not seen in time.
**Effort:** 2 days
**Solution:** Add Supabase `channel` subscription for `notifications` table changes.

---

### 13. No Skeleton Loaders
**Problem:** All screens show spinners. Perceived load time is 3-5s.
**Impact:** App feels slow. Users think it's broken.
**Effort:** 3 days
**Solution:** Build skeleton component library. Use on dashboard, tickets, visitors, stock.

---

### 14. No Ticket Comments / Collaboration
**Problem:** Tickets have no comment thread. Staff and tenant can't discuss issues.
**Impact:** Miscommunication, duplicate tickets, unresolved issues.
**Effort:** 3 days
**Solution:** Add comments table + comment list + comment input in ticket detail.

---

### 15. No Push Notification Preferences
**Problem:** Users can't mute notification types. All or nothing.
**Impact:** Users disable all notifications to avoid noise.
**Effort:** 2 days
**Solution:** Settings screen with toggle per notification type. Store in user preferences.

---

### 16. Password Min 6 Characters
**Problem:** `min(6)` password validation. OWASP recommends 8+ with complexity.
**Impact:** Weak authentication baseline.
**Effort:** 1 hour
**Solution:** Update Supabase auth config + add visual strength meter in UI.

---

### 17. No Deep Link for All Screens
**Problem:** Only ticket deep links work. `/visitors`, `/stock`, `/ppm` can't be opened from push notification.
**Impact:** Notifications require manual navigation.
**Effort:** 1 day
**Solution:** Add `linking` config in `expo-router` for all property screens.

---

### 18. No Stock Barcode Scanning
**Problem:** Stock lookup requires manual search. Warehouse/stockroom workflow is manual.
**Impact:** Field workers can't quickly find items.
**Effort:** 2 days
**Solution:** Add `expo-camera` + barcode scanner to stock screen.

---

### 19. No Checklist Creation on Mobile
**Problem:** Admin checklist management is web-only.
**Impact:** Field supervisors can't create/update checklists in the field.
**Effort:** 4 days
**Solution:** Build checklist template editor with item CRUD, frequency settings.

---

### 20. No Prefetch Pipeline
**Problem:** Every screen is a cold start. No data pre-loaded.
**Impact:** 3-5s per first visit to any screen.
**Effort:** 3 days
**Solution:** Extend `prefetchService` to cover all screens. Call on login + on navigation.

---

## P2 — NICE TO HAVE

### 21. No Skeleton Shimmer Animation
**Problem:** Static gray boxes instead of Linear-style shimmer.
**Impact:** Polish gap vs world-class apps.
**Effort:** 1 day

### 22. No Undo on Destructive Actions
**Problem:** Delete = instant, permanent. No undo toast.
**Impact:** No forgiveness for mistakes.
**Effort:** 1 day

### 23. No Image Compression
**Problem:** 5MB photos uploaded as-is.
**Impact:** Slow uploads, storage bloat.
**Effort:** 1 day

### 24. No Announcement / Org-wide Notice System
**Problem:** No way to broadcast messages to all tenants.
**Impact:** Communication gap.
**Effort:** 3 days

### 25. No Chat / In-App Messaging
**Problem:** Staff and tenants can't message each other directly.
**Impact:** Communication requires phone/email.
**Effort:** 5 days

---

## SUMMARY TABLE

| # | Item | Priority | Effort | Impact |
|---|------|----------|--------|--------|
| 1 | Ticket creation on mobile | P0 | 5 days | Core workflow |
| 2 | Property switch cache clear | P0 | 1 day | Security |
| 3 | Offline read support | P0 | 3 days | Field workers |
| 4 | Keyboard avoiding view | P0 | 1 day | All forms |
| 5 | Auth session caching | P0 | 1 day | Startup time |
| 6 | FlatList → FlashList | P0 | 2 days | Memory |
| 7 | Pagination on all lists | P0 | 2 days | Scale |
| 8 | Reports screen | P0 | 5 days | Value prop |
| 9 | Sentry source maps | P0 | 1 hour | Debugging |
| 10 | Staging environment | P0 | 2 days | QA |
| 11 | Biometric lock | P1 | 1 day | Security |
| 12 | Real-time notifications | P1 | 2 days | SLA |
| 13 | Skeleton loaders | P1 | 3 days | UX |
| 14 | Ticket comments | P1 | 3 days | Collaboration |
| 15 | Push preferences | P1 | 2 days | UX |
| 16 | Password strength | P1 | 1 hour | Security |
| 17 | Deep links | P1 | 1 day | UX |
| 18 | Barcode scanning | P1 | 2 days | Field use |
| 19 | Checklist creation | P1 | 4 days | Feature parity |
| 20 | Prefetch pipeline | P1 | 3 days | Performance |
| 21 | Shimmer animation | P2 | 1 day | Polish |
| 22 | Undo actions | P2 | 1 day | UX |
| 23 | Image compression | P2 | 1 day | Storage |
| 24 | Announcements | P2 | 3 days | Comms |
| 25 | Chat/messaging | P2 | 5 days | Engagement |

**Total P0 effort: ~20 days**
**Total P1 effort: ~25 days**
**Total P2 effort: ~12 days**

---

## NEXT STEPS

1. **Week 1:** Fix P0 items 1-10 (critical blockers)
2. **Week 2-3:** Fix P1 items 11-20 (scale readiness)
3. **Week 4+:** P2 polish items + competitor feature gaps
