# SCALABILITY GAPS — Mobile App Audit

---

## 1. What Breaks First (100 → 1,000 users)

| Bottleneck | When | Impact |
|------------|------|--------|
| **FlatList without pagination** | 100+ tickets | Memory crash, 10+ second renders |
| **React Query cache GC at 24h** | 50 concurrent sessions | Memory bloat |
| **Property switch cache contamination** | 2+ properties | P0 data leak |
| **Real-time via Supabase channels** | 100+ concurrent | Connection pool exhaustion |
| **No query cancellation** | Fast tab switching | Memory leak |
| **No API rate limiting** | Burst traffic | Server 429s, failed requests |

---

## 2. What Breaks at 10,000 users

| Bottleneck | Impact |
|------------|--------|
| **All lists fetch 100+ rows** — server bandwidth | 10x normal |
| **React Query cache in MMKV** — 24h cache × 10K users | 500MB+ storage |
| **Supabase free tier limits** — 60 concurrent connections | Connection errors |
| **No query deduplication** — same data fetched 3x | Wasted bandwidth |
| **Single-server API** — no CDN for static assets | Slow global access |
| **No image optimization pipeline** — 5MB photos × 10K users | Storage cost explosion |

---

## 3. What Breaks at 100,000 users

| Bottleneck | Impact |
|------------|--------|
| **Supabase Pro plan cost** — per-seat pricing | $999+/month |
| **Real-time channel limit** — 200 channels/user | Need dedicated WebSocket |
| **No push delivery SLA** — FCM free tier 500K/day | Notification delays |
| **Single-region database** — latency for global users | 200ms+ for EU users |
| **No CDN** — assets served from Supabase Storage | Slow load globally |
| **No database read replicas** — primary DB bottleneck | 1000+ TPS limit |
| **No edge functions** — API latency to single region | 500ms+ cold starts |

---

## 4. Cost Scaling

| Resource | 1,000 users | 10,000 users | 100,000 users |
|----------|-------------|--------------|----------------|
| **Supabase** | ~$500/mo | ~$2,000/mo | ~$10,000/mo |
| **FCM** | Free | Free (500K/day) | $0.04/1K above 500K |
| **Image storage** | $10/mo | $100/mo | $1,000/mo |
| **CDN (Cloudflare)** | $0 | $0 | ~$200/mo |
| **Monitoring** | $0 | $100/mo | $500/mo |
| **Total est.** | ~$510/mo | ~$2,200/mo | ~$12,000/mo |

---

## 5. Database Design Issues

| Issue | Current | Risk |
|-------|---------|------|
| **No pagination on any query** | `limit: undefined` | Memory explosion |
| **No cursor-based pagination** | Offset pagination | O(n) on large tables |
| **No database indexes** on `property_id` | Full table scan | 10K+ rows = slow |
| **RLS policies not validated** | Relies on server | Security gap |
| **No read replicas** | All reads hit primary | Scale limit |

---

## 6. Architecture Gaps for Scale

| Gap | Fix |
|-----|-----|
| **No CDN for images** | Cloudflare R2 or S3 + CDN |
| **No push notification queue** | Firebase + server queue |
| **No offline sync** | WatermelonDB or similar |
| **No query result caching** | Redis layer |
| **No image compression pipeline** | Cloudflare Polish or Sharp |
| **No database sharding strategy** | Multi-tenant sharding |
| **No API gateway** | Rate limiting, auth, routing |

---

## 7. Scalability Priority Matrix

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Add pagination to ALL list queries | 2 days | 10x more users |
| P0 | Fix cache contamination on property switch | 1 day | Data safety |
| P1 | Add database indexes on property_id, user_id | 1 day | 10x query speed |
| P1 | Implement query cancellation | 1 day | Memory safety |
| P1 | Add cursor-based pagination | 3 days | Infinite scroll |
| P2 | Redis caching layer for hot data | 5 days | 5x read speed |
| P2 | Image compression pipeline | 3 days | 80% storage savings |
| P2 | Multi-region database setup | 10 days | Global latency |
