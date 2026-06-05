# PERFORMANCE GAPS — Mobile App Audit

---

## 1. Startup Performance

| Bottleneck | Impact | Root Cause | Estimated Fix |
|------------|--------|------------|----------------|
| **Font loading** — Inter + Urbanist loaded on every launch | 1-3s white flash | Fonts in `@fontsource` not pre-loaded | P1: Add splash screen font pre-load |
| **Auth check** — Supabase session validated on each launch | 500ms-2s | `getSession()` called synchronously on root layout | P0: Cache auth state, validate async |
| **Query client re-hydration** — MMKV cache loaded on launch | 200-500ms | `queryClient.resume()` on root | P2: Lazy resume |
| **Splash screen** — no app-ready detection | White screen visible | Static splash, no `ready()` callback | P1: expo-splash-screen `ready()` pattern |

---

## 2. Property Switching

| Bottleneck | Impact | Root Cause | Estimated Fix |
|------------|--------|------------|----------------|
| **Cache not cleared on switch** — old data shows on new property | P0: Data contamination | No cache invalidation on `propertyId` change | P0: Invalidate React Query on property switch |
| **Full re-fetch on switch** — no diffing | 1-5s white screen | No incremental fetch | P2: Optimistic update pattern |
| **React Query key includes propertyId** — correct isolation | ✅ Already isolated | — | Done |

---

## 3. Dashboard Loading

| Bottleneck | Impact | Root Cause | Estimated Fix |
|------------|--------|------------|----------------|
| **Parallel fetches too many** — dashboard fires 10+ parallel queries | 3-8s total | Too many individual queries | P1: Collapse into 2-3 queries with JOINs |
| **No loading priority** — counts + lists load equally | 3-8s perceived slowness | All queries same priority | P1: Skeleton loader shows counts immediately |
| **No prefetch on login** — every screen first visit is cold | 1-3s per new screen | No prefetch pipeline | P1: Extend prefetchService to all modules |
| **No stale-while-revalidate** — shows loader on revisit | Poor UX | React Query not configured | P2: `staleTime: 0` for real-time screens |

---

## 4. Lists (FlashList vs FlatList)

| Issue | Current | Linear does | Priority |
|-------|---------|-------------|----------|
| **FlashList** used for stock, diesel | ✅ Good | Virtual list | Done |
| **FlatList** used for tickets, visitors | ❌ Slow for 100+ items | Window virtualization | P1: Migrate to FlashList |
| **No pagination** — fetches all 100 items at once | ❌ Memory bloat | Cursor-based pagination | P1: Add `limit` + `offset` to queries |
| **No item height estimation** — dynamic heights cause jank | ❌ Layout recalc | Known item heights | P2: Add `estimatedItemSize` |
| **No list item recycling** — FlatList re-renders on scroll | ❌ 60fps drops | Proper key + memo | P1: `getItemLayout` + `keyExtractor` |

---

## 5. Images

| Issue | Impact | Fix |
|-------|--------|-----|
| **No image compression** — 5MB photos uploaded as-is | Bandwidth + storage | P1: Add `imageCompression` utility |
| **No blur-up placeholder** — white space until image loads | Perceived slowness | P2: Thumbnail generation |
| **No image cache** — same avatar re-downloaded | Wasted bandwidth | P2: `@shopify/react-native-optimized-image` |
| **No WebP conversion** — PNG/JPEG at full size | Storage bloat | P2: Server-side conversion |

---

## 6. React Query Configuration

| Issue | Impact | Fix |
|-------|--------|-----|
| **`retry: 2`** on all queries — failed fetches retry 2x | Latency spike on transient errors | P2: Per-query retry config |
| **`gcTime: 24h`** — stale cache lives forever | Memory bloat | P1: Reduce to 1h for large lists |
| **No query cancellation** — navigation away doesn't cancel in-flight | Memory leak + wasted bandwidth | P1: `AbortController` via `signal` |
| **No optimistic updates** — mutation waits for server | Pessimistic UX | P2: Add `onMutate` optimistic pattern |
| **`networkMode: 'offlineFirst'`** — good for read, bad for write | Mutations fail silently | P1: `networkMode: 'online'` for mutations |

---

## 7. Bundle Size

| Asset | Size | Fix |
|-------|------|-----|
| **`@shopify/react-native-reanimated`** | ~500KB | Only import used functions |
| **`expo-camera`** | ~2MB | Lazy load only when needed |
| **`@gorhom/bottom-sheet`** | ~300KB | Already used efficiently |
| **`date-fns`** | ~100KB | Tree-shake unused functions |
| **All icons from `lucide-react-native`** | ~500KB | P1: Use specific icon imports |
| **Unused services** (ai, voice) bundled | Unknown | P1: Lazy imports for non-core modules |

---

## Performance Priority Ranking

| Priority | Item | Impact | Effort |
|----------|------|--------|--------|
| **P0** | Cache invalidation on property switch | Data contamination | 1 day |
| **P0** | Keyboard avoiding view fixes | Forms unusable | 1 day |
| **P0** | Auth session caching | 2s startup delay | 2 days |
| **P1** | Skeleton loaders on critical screens | 60% UX improvement | 3 days |
| **P1** | FlatList → FlashList migration for tickets | List performance | 2 days |
| **P1** | Prefetch pipeline for all modules | Zero cold loads | 3 days |
| **P1** | Pagination on all list screens | Memory + speed | 2 days |
| **P1** | Image compression on upload | Bandwidth savings | 1 day |
| **P2** | Bundle size audit | App size | 2 days |
| **P2** | Optimistic mutations | Perceived speed | 2 days |
| **P2** | AbortController for queries | Memory savings | 1 day |
