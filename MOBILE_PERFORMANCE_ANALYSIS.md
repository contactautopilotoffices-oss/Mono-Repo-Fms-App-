# Mobile App Performance Analysis

Scope: `saas_mobile_app` (Expo / RN client), `saas_mobileApp_server` (Next.js API), `server` (Fastify API).
Method: read the hot paths end to end (ticket list, ticket detail, status change, app boot, cache layer).

---

## TL;DR

The app is not slow because of React Native rendering. It is slow because **one user action
costs 20 to 50 serial network round trips**, and because **the one piece of code that was
supposed to make ticket status changes feel instant is broken and does nothing**.

Three root causes, in order of how much they hurt:

1. Every single API call pays 5 to 7 hidden round trips of server-side auth overhead before
   the real query runs.
2. The app talks to the server one call at a time. Opening a ticket is ~10 sequential calls.
   Loading the list is 5. Boot is 4. Nothing is batched.
3. The optimistic cache write for the ticket list targets a query key that does not exist and
   reads a field that does not exist, so it silently no-ops. The list waits for a full network
   refetch before a closed ticket looks closed.

---

## 1. Server: 5 to 7 hidden round trips on every request

`saas_mobileApp_server/app/api/query/route.ts` is the endpoint behind almost all app data.
Before it runs your query it does:

**a. A network call to Supabase Auth, per request.**

`lib/auth.ts:31`
```ts
const supabase = createAnonClient(token);
const { data, error } = await supabase.auth.getUser(token);
```

`auth.getUser()` is an HTTP request to the Supabase Auth server. That is 100 to 300 ms of pure
overhead on every single API call. A JWT can be verified locally with zero network.

**b. Two to four more sequential DB queries, per request.**

`lib/auth.ts:75` (`getPropertyAccess`) runs, in series:
1. `users` select `is_master_admin`
2. `properties` select `organization_id`
3. `property_memberships` select `role`
4. `organization_memberships` select `role` (if 3 missed)

No cache. Plus a `console.log` on each step.

**Net effect:** a request that reads one row costs roughly 5 round trips of overhead plus 1 of
actual work. Multiply that by the per-screen call counts in section 2 and the numbers get ugly:

| Action | App-side calls | Total server round trips |
|---|---|---|
| Open ticket detail | ~10 serial | ~50 to 60 |
| Load ticket list | 5 serial | ~25 to 30 |
| App boot (membership) | 4 serial | ~20 |

**c. Even Redis cache hits pay it.** `app/api/dashboard/bootstrap/route.ts` is well built
(parallel fan-out, Redis, 60 s TTL), but `getAuthenticatedUser` + `getPropertyAccess` both run
*before* `getCache()`, so a cache hit still costs 5 network hops.

---

## 2. The app talks to the server one call at a time

268 call sites go through the generic `serverApi.query` proxy. That proxy cannot batch, so each
one is its own HTTP request plus its own copy of the overhead above.

**Ticket detail: ~10 sequential awaits.**
`app/property/[propertyId]/tickets/[id].tsx`, `fetchTicket` (around lines 330 to 530) awaits, in
series: ticket, activity log, user name resolution, escalation logs, property features, MST list,
material requests, procurement logs, price visibility settings. Each one waits for the previous.

**Ticket list: 5 sequential calls before first paint.**
`tickets/index.tsx:341` `fetchTickets` does one list query, then awaits `getStatusCounts()`
(line 318), which runs 4 `count` queries one after another:
```ts
counts.all    = await fetchCount([]);
counts.mine   = await fetchCount([...]);
counts.open   = await fetchCount([...]);
counts.closed = await fetchCount([...]);
```
These four should be one SQL statement with `count(*) filter (where ...)`.

**Boot: splash is blocked on 4 serial calls.**
`context/AuthContext.tsx` `fetchMembership` chains org membership, property memberships, org
properties, property org lookup. `app/_layout.tsx` holds the splash until
`appReady && isHydrated && !isAuthLoading && !isMembershipLoading`.

**Also:** purpose-built endpoints already exist and are unused.
`saas_mobileApp_server/app/api/tickets/[id]/resolve`, `/assign`, `/start-work`,
`/api/tickets/stats` are all there. The app bypasses them and hits the generic proxy instead.

---

## 3. The optimistic ticket-list update is dead code

This is the direct cause of "mark closed takes many seconds".

`tickets/[id].tsx:645`
```ts
const queryKey = ['tickets', propertyId];
const previousTicketsData = queryClient.getQueryData<{ data: Ticket[] }>(queryKey);
if (previousTicketsData?.data) {
  queryClient.setQueryData(queryKey, { ...previousTicketsData, data: ... });
}
```

Two independent bugs:

- **Wrong key.** The list actually registers under
  `['tickets', propertyId, statusFilter, dateRange, isNeedsAttentionMode, limit]`
  (`tickets/index.tsx:372`). `getQueryData` is an exact-key lookup, so this returns `undefined`.
- **Wrong shape.** Even on a hit, the list caches `{ tickets, hasMore, statusCounts }`, not
  `{ data }`. So `previousTicketsData?.data` would be `undefined` anyway.

The `if` never passes. Nothing is written. The rollback on error is equally a no-op. Same bug in
`handleReassign` at line 769.

Result: the detail screen looks instant (its local `setTicket` works), but navigating back to the
list shows the stale status until a fresh 5-call network refetch completes. That is the lag the
user feels.

---

## 4. Everything refetches on mount, so the cache is paid for and thrown away

- `utils/queryClient.ts` sets `refetchOnMount: 'always'` as the global default.
- 25 call sites set it again explicitly.
- The detail screen sets `refetchOnMount: 'always'` **and** fires an extra `refetch()` in a
  `useEffect` on `[id, propertyId]` (`tickets/[id].tsx:566`), so opening a ticket runs the
  10-call fetch **twice**.

The MMKV persisted cache is restored at boot, then immediately discarded. You pay the disk cost
and the network cost and get the benefit of neither.

Compounding it: `refreshControl refreshing={isFetching}` on the list means a background refresh
renders as a full pull-to-refresh spinner, so the user reads "loading" even when data is on screen.

---

## 5. Retry and timeout config turns a weak network into a 39 second stall

`utils/api/fetchWithRetry.ts`: 3 attempts, 12 s timeout each, 1 s and 2 s backoff.
Worst case per call: 12 + 1 + 12 + 2 + 12 = **~39 s**.

Stacked on top:
- React Query `retry: 2` (queryClient.ts), so up to 3 x 39 s for one query.
- `serverApi.serverFetch` retries once on 401 and once on 403, each with a forced
  `refreshSession()` network call (`lib/serverApi.ts:113 to 131`).

A write that times out also gets replayed up to 3 times, which is a correctness risk, not just a
speed one.

---

## 6. Auth storage work on every request

`lib/serverApi.ts:60` `serverFetch` does, per request:
1. `getSupabaseToken()`, which calls `supabase.auth.getSession()` (storage read)
2. `supabase.auth.getSession()` **again** to synthesize a `Cookie` header
3. `JSON.stringify` the session into that cookie value

Step 2 and 3 are defensive leftovers for the case where `MOBILE_SERVER_URL` points at the Next.js
web app with cookie middleware. On the real path they are pure waste on the JS thread, on every
call.

---

## 7. The cache persister serializes the whole cache on the JS thread

`utils/queryClient.ts`
```ts
export const mmkvPersister = createSyncStoragePersister({
  storage: clientStorage,
  key: 'autopilot-react-query-cache',
  throttleTime: 1000,
});
```
with `gcTime: 7 days` and `shouldDehydrateQuery: status === 'success'` (PersistGate.tsx).

That is a `JSON.stringify` of the **entire** query cache, synchronously, up to once per second
during any activity. With ticket lists, dashboard payloads and seeded detail entries that is
megabytes of string work on the main JS thread. This is the most likely source of general
scroll and tap jank, independent of network.

At boot it is one large synchronous `JSON.parse`, and `PersistGate` renders `null` until it
finishes, so it also directly extends the splash.

---

## 8. List rendering

`tickets/index.tsx`:
- `renderTicket` (line 570) is a fresh closure every render, and `TicketListItem` is not
  memoized. Any of the 14 `useState` values in that screen changing re-renders every visible row.
- `useEffect` on `[... searchQuery]` calls `refetch()` (line 556). **A network round trip per
  keystroke**, no debounce.
- `loadMore` bumps `limit`, and `limit` is **in the query key**, so "load more" refetches all
  rows from offset 0 and re-runs the 4 counts instead of appending a page.
- FlashList is passed FlatList-only props (`initialNumToRender`, `maxToRenderPerBatch`,
  `windowSize`) which it ignores. (**Correction after implementation:**
  `estimatedItemSize` *was* already set on every FlashList in the app. An earlier
  draft of this report claimed it was missing on eight lists. That was wrong, and it
  was caught by a duplicate-attribute compile error when "adding" it.)
- `TicketListItem` runs a 1-second `setInterval` **per row**, firing two state updates
  each, so a screen of 20 rows means 40 re-renders every second, permanently.
  `TicketCard` has the same per-instance fallback timer. This is probably the single
  biggest cause of general scroll and tap jank, ahead of the persister.
- The `displayedTickets` useMemo runs date math and nested `.some()` over every row on every
  filter change.

Also worth noting: `tickets/[id].tsx` is 3784 lines in one file. That is real parse and mount cost.

---

## 9. Payload size

`select: '*'` with nested joins is the norm. Examples:
- The dashboard bootstrap pulls full `tickets` and `stock` rows only to compute `.length` and a
  few counts. Those should be `head: true` counts or SQL aggregates.
- The list select pulls `creator:users!raised_by(..., property_memberships(role, property_id))`
  for every row just to decide whether the creator is a tenant.

---

## 10. Logging

101 `console.log` in app source, including `[serverApi] POST <url>` on every request and
`[RootLayout] Rendering...` on every root render. On the server, `getPropertyAccess` logs 3 lines
per request. `babel.config.js` has no `transform-remove-console` for production, and Sentry
converts console calls into breadcrumbs, so this costs real time in release builds.

---

## 11. Two servers doing the same job

`server/` (Fastify, port 3001) and `saas_mobileApp_server/` (Next.js, port 3000) both expose
`/api/query` with **different** auth models: Fastify builds an anon client per request and leans
on RLS; Next calls `getUser`, checks property access manually, then uses the service-role client.
`serverApi` defaults to port 3000. This is two codebases to optimize, two security surfaces, and
a guarantee that a fix lands in only one of them.

---

# What to do, in order

## Phase 0: make status changes feel instant (half a day, biggest felt win)

1. **Fix the optimistic list write.** Use a prefix match and the right field:
   ```ts
   queryClient.setQueriesData(
     { queryKey: ['tickets', propertyId] },   // prefix, matches all filter variants
     (old: any) => old?.tickets
       ? { ...old, tickets: old.tickets.map(t => t.id === id ? { ...t, ...patch } : t) }
       : old
   );
   ```
   Better: convert `handleUpdateStatus` and `handleReassign` to `useMutation` with
   `onMutate` / `onError` / `onSettled` so snapshot and rollback are handled by the library
   instead of hand-rolled. Fix `handleReassign` the same way.
2. **Delete the verify round trip.** `handleUpdateStatus` does an `update` then a separate
   `select` to confirm it. Have the update return the row (`select: 'id, status, resolved_at'`)
   and trust it. That is 2 calls to 1.
3. **Remove the duplicate fetch on detail open** (`tickets/[id].tsx:566` useEffect `refetch()`),
   since `refetchOnMount` already covers it.
4. **Retry/timeout sanity:** reads 1 retry at 6 s, writes 0 retries. React Query `retry: 1`.
5. **`refetchOnMount: 'always'` to `true`** globally, so `staleTime` actually does its job and
   cached screens paint instantly.
6. **Background refresh must not look like loading.** `refreshing={isFetching && !data}`, or a
   thin top progress bar.

After phase 0, closing a ticket is 0 ms perceived everywhere in the app, which is the actual ask.

## Phase 1: kill the per-request server overhead (1 to 2 days)

7. **Verify the JWT locally.** Replace `supabase.auth.getUser(token)` with `jose` +
   `SUPABASE_JWT_SECRET` (or the project JWKS). Removes one network hop from every request.
8. **Cache `getPropertyAccess` in Redis.** Key `access:{userId}:{propertyId}`, TTL 5 min,
   invalidate on membership change. Removes 2 to 4 DB hops from every request.
9. **One `withAuth(handler)` wrapper** doing both, used by every route, so this is fixed once.
10. **Strip the per-request `console.log` in `getPropertyAccess`.**

Phase 1 alone takes roughly 400 to 600 ms off *every* call in the app.

## Phase 2: one screen, one request (3 to 5 days)

11. **`GET /api/tickets/:id/detail`** returning ticket + comments + activities + escalations +
    MSTs + feature flags + procurement + price visibility in one response, fanned out with
    `Promise.all` server side. Replaces ~10 serial app calls with 1.
12. **`GET /api/tickets`** returning `{ items, hasMore, counts }`, with the 4 counts as a single
    Postgres aggregate (`count(*) filter (where status in (...))`) behind an RPC.
    Replaces 5 serial calls with 1.
13. **`POST /api/tickets/:id/status`** writing status + activity log in one transaction and
    **queueing** notifications rather than awaiting them.
14. **Freeze `/api/query` for new code.** Migrate the hot screens to typed endpoints; leave the
    cold ones on the proxy.

## Phase 3: fix the client cache and list (2 to 3 days)

15. **Stop stringifying the world.** Either move to an async persister, or restrict
    `shouldDehydrateQuery` to an explicit allowlist (dashboard, tickets list, profile,
    memberships), drop `gcTime` for list data from 7 days to 1 to 2 days, and raise
    `throttleTime` to 3000 to 5000 ms.
16. **`useInfiniteQuery` for the ticket list**, so "load more" appends a page and `limit` leaves
    the query key.
17. **Debounce search 300 ms**, and filter the fetched page client side where the dataset allows
    it instead of refetching.
18. **`React.memo` on `TicketListItem`** with a custom comparator (the parent passes
    a fresh `onPress` and a freshly derived `escalationChain` per row, so a default
    shallow compare can never match and memo would do nothing), `useCallback` on
    `renderTicket`, and one shared app-wide ticker in place of the per-row timers.
19. **Move row-level computation (SLA, needs-attention, escalation chain) into the query's
    `select`**, so it runs once per fetch instead of once per render.

## Phase 4: hygiene

20. `babel-plugin-transform-remove-console` for production, keeping `warn` and `error`.
21. Replace `select: '*'` with explicit columns on the hot paths. Count with `head: true`.
22. **Pick one server.** The Next app has Redis, the dashboard aggregates and the dedicated
    ticket routes, so it is the stronger base. Retire the Fastify duplicate (or the reverse, but
    not both).
23. **Supabase realtime on `tickets`** for the list, so a status change from another device pushes
    instead of being discovered on the next mount.
24. **Instrument before the next round.** A `Server-Timing` header per route plus a `__DEV__`
    timer in `serverFetch` gives you real numbers instead of guesses.

---

## Expected outcome

| Path | Now | After phases 0 to 2 |
|---|---|---|
| Mark ticket closed (perceived) | seconds | 0 ms, instant everywhere |
| Open ticket detail | ~10 serial calls, ~50 round trips | 1 call, ~2 round trips |
| Load ticket list | 5 serial calls, ~25 round trips | 1 call, ~2 round trips |
| Per-call fixed overhead | 400 to 600 ms | 10 to 30 ms |
| App boot | 4 serial calls + big JSON.parse | cached paint, refresh in background |

Roughly a 5x to 15x cut in wall clock on the hot paths, and the status-change flow becomes
genuinely instant rather than merely optimistic on one screen.

---

## The principle to hold on to

"Instant frontend, whatever the backend takes" needs four things, and the codebase currently has
one and a half:

1. Write the cache **before** the request (broken: wrong key and wrong field).
2. Never `await` before painting (mostly right).
3. Reconcile on settle, roll back on error (written, but unreachable because of 1).
4. Do not refetch what you just wrote (broken: `refetchOnMount: 'always'` everywhere).

Fix 1 and 4 and the app changes character immediately, before any server work lands.


---

# Implementation notes (added after the fixes landed)

What the implementation pass found that this analysis had missed or got wrong:

1. **`estimatedItemSize` was never missing.** The scan behind that claim was faulty.
   Corrected inline above.

2. **A runaway refetch loop in the three Lovable dashboards.** An effect with
   `isFetching` and `hasValidDashboardData` in its deps and no guard meant any
   response failing the shape check (an error payload, a 403) produced: fetch
   settles, `isFetching` goes false, effect reruns, refetch, repeat, for as long as
   the screen stayed open. Not a slow query, a permanent request loop.

3. **Per-row 1-second timers**, as corrected above.

4. **An N+1 loop in `useOrgData`.** Three separate `for` loops each issued one
   request per property (electricity reading, health score, attention items). For an
   org with 20 properties that is 7 + 60 = 67 sequential round trips for one screen.

5. **A latent crash in `TicketCard`.** `resolvedAt` is declared in the props interface
   and read at line 61 but was never destructured. `@ts-nocheck` hid it.

6. **Dead prefetch code.** `prefetchCriticalOnLogin` prefetched tickets under a
   hardcoded 6-element query key while the screen registers an 11-element one, and
   wrote a bare array where the screen caches an object. It spent a request on every
   login to populate an entry nothing read, after an unconditional 1.5s sleep.

Also corrected while implementing: the post-update verification must NOT treat an
empty returned row set as failure. The server runs SELECTs through the admin client
but mutations through the anon client under RLS, so the implicit SELECT-after-UPDATE
can legitimately come back empty for a row the user may both see and update. Failing
there would have rolled back a write that actually landed.

## Deliberately not done

- **Pagination still over-fetches.** `loadMore` raises `limit`, which is in the query
  key, so page 2 refetches rows 1..40 rather than appending 21..40. The status counts
  no longer re-run (they moved to their own key, keyed without `limit`) and
  `placeholderData` stops the list flashing empty, but converting the screen to
  `useInfiniteQuery` is a real refactor of a 1400-line file.
- **Per-screen aggregate endpoints (phase 2).** `fetchTicket` now runs in 3 parallel
  waves instead of 10 serial awaits, which captures most of the latency win without a
  server contract change. A single `GET /api/tickets/:id/detail` is still the better
  end state.
- **Merging the two servers.** Out of scope for a performance pass.

## Verification status

`node_modules` is not installed in the environment these changes were made in, so
`tsc -p`, `eslint` and `jest` could not be run. What was done instead: a standalone
`tsc` syntax/grammar pass over all 60 changed files (which caught two real
duplicate-attribute bugs), and standalone unit tests for the three pieces of new
logic that are easy to get subtly wrong: the JWT verifier (15 cases including
alg-confusion, tampering, expiry and clock skew), the property-access memo (TTL,
eviction, invalidation) and the persistence allowlist. **The full typecheck, lint and
test suite still needs to run, and the app needs a manual smoke test.**
