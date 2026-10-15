# Mobile App Slow Loading: Diagnosis (2026-10-15)

**Question:** is the mobile app slow because of the UI, the database, or the API?

**Answer:** mainly the **API layer**. Too many requests go out on startup, they run one after another instead of side by side, and they all go to one serverless host. The second biggest cost is **data**: property images are stored as base64 text, so normal queries download megabytes. The database is a smaller and partly unverified factor. Rendering (UI) is not the main problem, except for one cache setting that made most roles show a skeleton on every cold start.

This was checked against the code after the previous perf PR (b9926ff). Nothing here repeats what `MOBILE_PERFORMANCE_ANALYSIS.md` already fixed. There was no access to the live database or Vercel from the build container, so items marked *unverified* need a quick check by someone with access.

---

## Fixed in this branch

| # | Layer | Problem | Fix |
|---|---|---|---|
| 1 | UI / cache | The disk-cache allowlist (`utils/queryClient.ts`) matches the exact first key segment. The live staff, MST and soft-service dashboards (`mst-dashboard-lovable`), their counts (`mst-dashboard-ticket-counts`), the staff dashboard (`dashboard-staff`) and the tenant list (`tenant_tickets`) were not on it. Those roles always cold-started on a skeleton. | Added the real keys. |
| 2 | API | The splash screen prefetched the property-admin dashboard plus 6 module queries for **every** role (`components/splash/AnimatedSplash.tsx`). Only org and property admins ever see that data. One of the queries (tickets) used a key no screen reads. | Prefetch runs only for roles that render the admin dashboard, and the dead tickets prefetch is removed. |
| 3 | API | The property layout rendered nothing until `GET /api/auth/property-access` returned, so no screen query could even start. The check also re-ran on every navigation and every membership refresh. | Render straight away when the cached membership already lists the property, and confirm in the background. This is no looser than before, because a failed server check already fell back to the membership role. Access grants are cached for 5 minutes; denials are never cached. |

## Needs a human (not changed here)

### A. Property images stored as base64 (data, biggest payload cost)
- **Evidence:** `saas_mobileApp_server/props.json` (a dump committed 2026-07-20). 5 of 12 properties have `data:` URIs in `properties.image_url`, about 6.9 MB in total.
- **Where it hurts:** `image_url` is selected in the membership load (`context/AuthContext.tsx`). That runs on every boot, every return to the foreground and every token refresh, and the multi-MB JSON is parsed on the JS thread. It is also in the admin dashboard routes.
- **Check (read-only):** `select name, length(image_url) from properties where image_url like 'data:%';`
- **Fix:** move those images into Supabase Storage. The web app already has `/api/properties/upload-image`. Then `image_url` becomes a short URL and nothing else needs to change.

### B. Server auth speedups may be off in production (*unverified*)
- **Token check:** local verification of the login token needs `SUPABASE_JWT_SECRET` (`saas_mobileApp_server/lib/jwt.ts`). Without it, every request makes an extra network call to Supabase Auth.
- **Shared access cache:** it needs the `UPSTASH_*` variables (`lib/redis.ts`). Without them, the access cache is per serverless instance only.
- **Gap:** `DEPLOYMENT_STEPS.md` lists neither variable.
- **Region:** `vercel.json` pins no region, so functions likely run in US East while users and data may be in India. If Supabase is in Mumbai, add `"regions": ["bom1"]`.

### C. Database indexes and RLS (*unverified applied state*)
- **Indexes:** the composite indexes for the hot ticket queries exist only in `saas_one/backend/db/migrations/20260402_performance_indexes.sql`, not in `saas_one/supabase/migrations`:
  - `tickets(property_id, created_at)`
  - `tickets(property_id, status, created_at desc)`
  - `property_memberships(user_id, property_id)`
  - `notifications(user_id)`
- **Check:** confirm with `select indexname from pg_indexes where tablename in ('tickets','property_memberships','notifications');`
- **RLS:** several ticket SELECT policies call `auth.uid()` per row. Wrapping it as `(select auth.uid())` lets Postgres evaluate it once per query.

### D. Heavy server routes
- **`/api/dashboard/property-admin`:** about 26 queries per cache miss, 9 of them exact counts, with unbounded reads of visitor, revenue, meter and PPM tables. Those reads are capped only by PostgREST's 1000-row default, which also makes the totals wrong. The cache is per user with a 60 s TTL, so it rarely hits.
  - **Fix:** limits or date windows, one SQL aggregate for the counts, and a per-property cache.
- **Ticket list:** 1 list call plus 6 exact counts (one per tab). A single `count(*) filter (where ...)` RPC would replace them, but that needs a DB function a human applies.
- **Ticket detail:** 11 requests from the device. A single `GET /api/tickets/:id/detail` that runs them on the server would cut that to 1.

### E. Smaller UI items
- **Thumbnails:** ticket row thumbnails are 44 px but load the full photo through the basic RN `Image`. `expo-image` is installed but unused.
- **Login images:** the login screen loads PNGs of 2.5 MB, 2.0 MB and 1.3 MB.
- **Startup code:** `dashboard/index.tsx` statically imports 8 role dashboards. Three of them are near-identical 2300-line copies (Staff, MST, Soft Service). Lazy-loading per role would cut startup JS work.

## Security notes found during the audit (not speed)
- **Committed secrets:** `server/.env` is committed with a service-role key. Rotate it.
- **Generic query route:** `/api/query` SELECTs that carry no property filter are not scoped.
- **Admin dashboard data:** any member of a property, tenants included, gets the full property-admin dashboard data.
