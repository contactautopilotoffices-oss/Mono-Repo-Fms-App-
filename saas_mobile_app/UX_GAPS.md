# MOBILE UX GAPS — Mobile App Audit

> Comparing against Uber, Airbnb, Linear, Slack, Notion standards.

---

## 1. Startup Experience

### Current
- Expo splash screen (static, branded)
- Font loading causes white flash before Inter/Urbanist loads
- No skeleton screens — full white loading spinners
- Auth check is synchronous from cached storage

### Gaps vs Linear/Uber
| Gap | Linear Does | Mobile Does | Priority |
|-----|-------------|-------------|----------|
| **Skeleton loaders** | Gray content skeletons | White spinners | P1 |
| **Instant app readiness** | Font pre-loaded | White flash on load | P1 |
| **Smart caching** | Show stale then update | Full spinner until load | P0 |
| **Predictive navigation** | Pre-load next screen | Wait for navigation | P2 |

---

## 2. Navigation

### Current
- Stack navigation via `expo-router`
- Property context in URL params
- Dashboard tab bar with 6+ items (scrolls)
- Bottom sheet modals for actions

### Gaps vs Airbnb/Slack
| Gap | Airbnb/Slack Does | Mobile Does | Priority |
|-----|-------------------|-------------|----------|
| **Gesture navigation** | Swipe back, swipe tabs | Tap only | P1 |
| **Haptic feedback** | Every tap = haptic | No haptics | P2 |
| **Breadcrumb context** | Always know where you are | Title only | P1 |
| **Deep link handling** | Universal links work | Works for tickets | P1 |
| **Property selector in nav** | Always visible context | URL param only | P1 |

---

## 3. Loading States

### Current
- `ActivityIndicator` spinners (generic)
- `isLoading` disables entire component
- No skeleton loaders on any screen
- Loading over content (no skeleton behind)

### Gaps
| Gap | Impact | Priority |
|-----|--------|----------|
| **No skeleton loaders** — Linear-style gray shapes during fetch | Disorienting for 1-3s fetches | P1 |
| **No shimmer animation** — sliding gradient on skeletons | Polish gap | P2 |
| **No loading priority** — critical vs non-critical not distinguished | UX inconsistency | P1 |
| **Pull-to-refresh on ALL lists** — even when data is already fresh | Unnecessary interaction | P2 |
| **Full-screen loader overlay** blocks interaction unnecessarily | Perception of slowness | P1 |

---

## 4. Empty States

### Current
- Generic empty states: icon + title + subtitle
- Example: "No notifications" with bell icon
- No suggested action from empty state

### Gaps vs Airbnb/Linear
| Gap | Impact | Priority |
|-----|--------|----------|
| **No empty state illustrations** — no visual delight | Emotional connection gap | P2 |
| **No "Create First Item" CTA** in empty states | Discovery gap | P1 |
| **No onboarding hint** in empty states | Activation gap | P1 |
| **No "Invite team" empty state** | B2B gap | P1 |

---

## 5. Error States

### Current
- `Alert.alert()` for errors (native iOS/Android dialog)
- Generic error messages ("Something went wrong")
- No retry actions on errors
- No offline error differentiation

### Gaps vs Uber/Linear
| Gap | Impact | Priority |
|-----|--------|----------|
| **Alert.alert() is jarring** — inline error banners preferred | Friction | P1 |
| **No error state illustrations** — red X icon only | Polish gap | P2 |
| **No "Retry" button** on fetch failures | UX gap | P1 |
| **No "Offline mode" banner** when no connection | Awareness gap | P1 |
| **No field-level validation** — errors only on submit | Form UX gap | P1 |
| **No "Save draft" on error** | Data loss risk | P1 |

---

## 6. Success States

### Current
- Toast notifications (`toast()` utility)
- `Alert.alert()` for confirmations
- No celebration animations

### Gaps
| Gap | Impact | Priority |
|-----|--------|----------|
| **No success animations** — checkmark, confetti for major actions | Delight gap | P2 |
| **No "Undo" action** after destructive operations | Forgiveness gap | P1 |
| **Alert.alert() for success** — should be toast | Friction | P1 |
| **No "New item" indicator** after creation | Awareness gap | P2 |

---

## 7. Forms

### Current
- Manual TextInput styling per field
- No unified form validation library
- Submit button disables but doesn't show field errors

### Gaps vs Linear/Notion
| Gap | Impact | Priority |
|-----|--------|----------|
| **No form library** (react-hook-form or formik) | Code duplication | P1 |
| **No field-level errors** inline below inputs | UX gap | P1 |
| **No "required" visual indicators** | Discoverability gap | P1 |
| **No date picker component** — text inputs for dates | UX gap | P1 |
| **No autocomplete/typeahead** for user/role pickers | Speed gap | P2 |
| **No auto-save** — everything is explicit save | Data loss risk | P1 |
| **No keyboard-aware scrolling** — form cuts off by keyboard | Critical UX bug | P0 |

---

## 8. Images & Media

### Current
- `Image` component for thumbnails
- Full-screen image preview
- ImagePicker for uploads
- Placeholder for missing images

### Gaps vs Airbnb
| Gap | Impact | Priority |
|-----|--------|----------|
| **No image zoom gesture** — pinch to zoom | Feature gap | P1 |
| **No progressive image loading** — blur-up technique | Perceived slowness | P1 |
| **No image compression** before upload | Bandwidth/storage | P1 |
| **No video playback inline** — only thumbnail | Media gap | P2 |
| **No image cropping/rotation** | UX gap | P2 |

---

## 9. Accessibility (a11y)

### Current
- `accessibilityLabel` on few components
- No ARIA roles
- No screen reader testing
- TouchableOpacity used throughout

### Gaps
| Gap | Impact | Priority |
|-----|--------|----------|
| **No accessibility audit** — unknown WCAG level | Compliance risk | P1 |
| **No dynamic type support** — fixed font sizes | a11y gap | P1 |
| **No color contrast check** | a11y gap | P1 |
| **No focus management** for modals | a11y gap | P1 |
| **No reduced-motion support** | a11y gap | P2 |
| **No accessibility labels** on icons/buttons | Screen reader users excluded | P1 |

---

## 10. Polish Details

| Detail | Linear/Notion | Mobile App | Priority |
|--------|---------------|------------|----------|
| **Pull-to-refresh** | Standard | Partial (not on all lists) | P2 |
| **Long-press context menu** | Standard | Not implemented | P2 |
| **Swipe-to-dismiss** | Standard | Not implemented | P2 |
| **Animated transitions** | Fluid 300ms | Instant or no animation | P1 |
| **Loading spinners vs skeletons** | Skeletons | Spinners | P1 |
| **Toast vs Alert** | Toast | Alert.alert() | P1 |
| **Safe area insets** | Handled everywhere | Inconsistent | P1 |
| **Keyboard avoiding** | Always | Often breaks forms | P0 |
| **Bottom sheet vs modal** | Bottom sheet preferred | Mixed usage | P2 |
