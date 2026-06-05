# PLAYSTORE READINESS GAPS — Mobile App Audit

---

## 1. Crash Handling

| Gap | Current | Needed | Severity |
|-----|---------|--------|----------|
| **Global ErrorBoundary** | ✅ Present in `_layout.tsx` | — | Done |
| **JS crash handling** | ✅ ErrorBoundary catches render errors | — | Done |
| **Native crash** | ❌ Not handled | NDK crashes go to Play Store | P0 |
| **Crash on no network** | ❌ No offline state | Graceful degradation | P0 |
| **Crash on permission denied** | ❌ Not handled | Request permission with rationale | P0 |
| **Out of memory** | ❌ No boundary | Lazy loading, image limits | P1 |

---

## 2. Offline Support

| Gap | Current | Needed | Severity |
|-----|---------|--------|----------|
| **Read offline** | ❌ Most screens fail | Cache-first pattern | P0 |
| **Write offline** | ❌ Mutations fail | Queue + sync later | P0 |
| **Offline indicator** | ❌ No banner | "You're offline" banner | P1 |
| **Offline error state** | ❌ White screen | Cached content + retry | P1 |
| **Auto-retry on reconnect** | ❌ No | Pending mutations replay | P1 |

---

## 3. Permissions

| Permission | Requested | When | Rationale Shown | Severity |
|------------|-----------|------|----------------|---------|
| **Camera** | ✅ Yes | When taking photo | ✅ "Take photos of issues" | Done |
| **Microphone** | ✅ Yes | When recording | ✅ "Record voice notes" | Done |
| **Notifications** | ✅ Yes | Onboarding | ✅ "Get alerts for tickets" | Done |
| **Location** | ❌ Not | Not requested | — | N/A |
| **Storage** | ✅ Yes | Photo upload | ✅ "Save photos" | Done |
| **Phone** | ❌ Not | Not requested | — | N/A |
| **SMS** | ❌ Not | Not requested | — | N/A |

**Missing**: Proper permission rationale UI before request (not just system dialog).

---

## 4. Battery Optimization

| Gap | Current | Needed | Severity |
|-----|---------|--------|----------|
| **Background location** | ❌ Not used | — | OK |
| **Background fetch** | ❌ Not used | — | OK |
| **Wake locks** | ❌ Not used | — | OK |
| ** Excessive renders** | ❌ Many re-renders on scroll | `useMemo`, `React.memo` | P1 |
| **Image loading** | ❌ Full resolution | Thumbnail + full on demand | P1 |
| **Push polling** | ❌ 30s interval | Adaptive (5min background) | P1 |

---

## 5. Network Handling

| Gap | Current | Needed | Severity |
|-----|---------|--------|----------|
| **Timeout handling** | ❌ No timeout | 30s timeout + retry | P0 |
| **Retry on 5xx** | ❌ No retry | Exponential backoff | P1 |
| **Network change listener** | ❌ Not implemented | `NetInfo` + adaptive behavior | P1 |
| **Download manager** | ❌ Inline | Background downloads | P2 |
| **Request queuing** | ❌ Direct | Queue during offline | P0 |

---

## 6. App Updates

| Gap | Current | Needed | Severity |
|-----|---------|--------|----------|
| **In-app update prompt** | ❌ Not implemented | `expo-updates` | P0 |
| **Force update** | ❌ Not implemented | Critical security patches | P1 |
| **Changelog display** | ❌ Not implemented | What's new modal | P1 |
| **Background update** | ❌ Not implemented | Silent update | P2 |

---

## 7. Privacy & Compliance

| Requirement | Current | Severity |
|-------------|---------|----------|
| **Privacy Policy URL** | ❌ Not in Play Store listing | P0 |
| **Data Safety Form** | ❌ Not completed | P0 |
| **Age rating (13+)** | ❌ Not set | P1 |
| **Ads declaration** | ❌ No ads | P0 (declare none) |
| **App Tracking Transparency** | ❌ Not implemented | P1 (iOS) |

---

## 8. Store Listing

| Item | Current | Needed | Severity |
|------|---------|--------|----------|
| **App icon** | ✅ Present | — | Done |
| **Screenshots** | ❌ None | 3+ screenshots | P0 |
| **Short description** | ❌ Not set | 80 char compelling | P0 |
| **Full description** | ❌ Not set | 4000 char SEO-optimized | P0 |
| **Feature graphic** | ❌ Not set | 1024x500 hero image | P0 |
| **Video preview** | ❌ Not set | 30s walkthrough | P1 |
| **Category** | ❌ Not set | Business / Productivity | P0 |
| **Tags** | ❌ Not set | 5+ relevant tags | P1 |

---

## 9. Build & Signing

| Item | Current | Needed | Severity |
|------|---------|--------|----------|
| **Release build** | ❌ Debug only | AAB signed with release key | P0 |
| **ProGuard/R8** | ❌ Not configured | Obfuscate JS bundle | P1 |
| **Version code** | ✅ In app.json | Incremented on release | Done |
| **ABI splits** | ❌ Not configured | Separate APK per arch | P2 |
| **JS bundle embedded** | ✅ Yes | Not reliant on Metro | Done |

---

## 10. Pre-Launch Checklist

| Item | Status | Notes |
|------|--------|-------|
| Privacy Policy URL | ❌ Missing | Create + host |
| Data Safety form | ❌ Incomplete | Declare all data collected |
| Screenshots (3+) | ❌ Missing | Record on device |
| Short description | ❌ Missing | Write compelling copy |
| Full description | ❌ Missing | SEO-optimized |
| Feature graphic | ❌ Missing | Design required |
| Release AAB | ❌ Not built | `eas build --platform android --profile production` |
| Testflight (iOS) | ❌ Not submitted | N/A for Android |
| Accessibility audit | ❌ Not done | Screen reader + contrast |
| Performance audit | ❌ Not done | Profiler + JankCheck |
| Crash-free rate baseline | ❌ Not measured | Establish baseline first |
| Load test | ❌ Not done | k6 or Artillery |
