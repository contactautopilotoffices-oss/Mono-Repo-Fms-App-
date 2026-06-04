# PRODUCT GAPS — Mobile App Audit

> What is missing, broken, or unpolished from a product perspective.

---

## 1. Notifications

### Current State
- `NotificationBanner` shows foreground push in-app
- `NotificationBell` (dashboard) shows bell icon with unread count
- `NotificationModal` shows notification list with deep linking
- Background push goes through FCM → notification tray
- `usePushNotifications` hook handles token registration

### Gaps
| Gap | Impact | Priority |
|-----|--------|----------|
| **No dedicated Notifications screen** — users must open dashboard to see bell | Low discoverability | P1 |
| **No mark-all-read action** in NotificationModal | UX friction | P2 |
| **No notification preferences/settings** — can't mute types | User control missing | P1 |
| **FCM token stored as `provider: 'fcm'` now** but server `notifications/test` route not protected | Minor fix needed | P0 |
| **Real-time via Supabase channels** not used for notifications — only polling via `NotificationBell` | Stale data | P1 |
| **No notification sound customization** | Personalization gap | P2 |
| **iOS push permissions** not handled separately from Android | iOS will fail silently | P1 |

---

## 2. Property Selection

### Current State
- Org Super Admin sees all properties in dashboard
- Property selector in header
- `propertyId` passed via `useGlobalSearchParams` throughout

### Gaps
| Gap | Impact | Priority |
|-----|--------|----------|
| **No property switcher UI** for users with 1 property | Minor UX | P2 |
| **Cache contamination** — switching properties doesn't clear React Query cache for previous property | Data leak between properties | P0 |
| **No "all properties" aggregate view** for org admins on mobile | Feature parity | P1 |
| **Property-level roles** not enforced on mobile — no server-side validation per property | Security risk | P0 |

---

## 3. Onboarding

### Current State
6-step wizard: Welcome → Phone → Property → Role → Voice → Skills → Complete

### Gaps
| Gap | Impact | Priority |
|-----|--------|----------|
| **Voice onboarding is broken** — `expo-speech` fallback with no API key management | Dead feature | P1 |
| **Skills selection** stored but never used for ticket routing | Dead feature | P2 |
| **No skip/retry flow** for failed permission requests | UX friction | P1 |
| **No user avatar upload** during onboarding | Profile completeness | P2 |
| **No org invitation flow** — invite via email/link not implemented | B2B onboarding gap | P1 |

---

## 4. Tickets

### Current State
- Ticket list with status tabs (open/in-progress/resolved/closed)
- Ticket detail with status updates, media, comments
- Real-time via Supabase channels in `useTenantTickets`
- Procurement catalog modal accessible from ticket detail

### Gaps
| Gap | Impact | Priority |
|-----|--------|----------|
| **No ticket creation** on mobile (web-only) | Critical feature gap | P0 |
| **No ticket filtering** by priority, date range, assignee | Discovery friction | P1 |
| **No ticket sorting** (by date, priority, status) | Discovery friction | P1 |
| **Ticket comments** not implemented | Collaboration gap | P1 |
| **Ticket assignment** on mobile not implemented | Workflow gap | P0 |
| **Procurement catalog modal** — error "property is procurement role doesnt exist" (fixed in server) | Was P0, now resolved | Done |
| **Deep link to ticket** from notification works but requires propertyId in URL | Works after fix | Done |
| **No SLA timer display** on ticket card | Urgency indicator missing | P1 |
| **No ticket priority badges** on list view | Visual hierarchy missing | P2 |
| **No offline ticket viewing** | Field worker use case broken | P0 |

---

## 5. Visitors (VMS)

### Current State
- Visitor check-in/checkout
- Pre-registration
- Kiosk mode
- Staff approval workflow

### Gaps
| Gap | Impact | Priority |
|-----|--------|----------|
| **No QR code generation** for pre-registered visitors | Check-in friction | P1 |
| **No visitor badge printing** | Physical security gap | P2 |
| **No host notification** when visitor checks in | Communication gap | P1 |
| **No visitor history export** | Compliance gap | P2 |
| **No bulk visitor import** | Admin workflow gap | P2 |
| **Kiosk mode** — UI may not be optimized for touch-only | Use case risk | P1 |

---

## 6. Stock / Inventory

### Current State
- Stock list with categories
- Add item modal
- Low stock alerts
- QR code display

### Gaps
| Gap | Impact | Priority |
|-----|--------|----------|
| **No barcode scanning** for stock lookup | Field use case broken | P1 |
| **No stock adjustment** (damaged, expired, write-off) | Inventory accuracy gap | P1 |
| **No stock transfer** between properties | Multi-property gap | P1 |
| **No stock history/audit trail** | Compliance gap | P1 |
| **No low stock threshold configuration** on mobile | Admin gap | P2 |
| **No supplier management** | Procurement gap | P1 |

---

## 7. Procurement

### Current State
- Material request list
- Budget tracking
- Procurement catalog modal with cart

### Gaps
| Gap | Impact | Priority |
|-----|--------|----------|
| **No procurement request creation** on mobile | Feature gap | P0 |
| **No approval workflow UI** for managers | Workflow gap | P1 |
| **No quotation upload** on mobile | Procurement gap | P1 |
| **No budget top-up UI** on mobile | Admin gap | P1 |
| **No order tracking** view | Status gap | P1 |

---

## 8. Reports

### Current State
- Report cards UI skeleton (reports/snags, reports/energy, etc.)
- Reports screens mostly placeholders/not implemented

### Gaps
| Gap | Impact | Priority |
|-----|--------|----------|
| **All report screens are empty** — no data visualization | Feature gap | P0 |
| **No PDF/CSV export** on mobile | Export gap | P1 |
| **No custom date range selection** | Analysis gap | P1 |
| **No charts/graphs** — Linear-style analytics missing | Visual gap | P1 |

---

## 9. Settings

### Current State
- Profile view
- Theme toggle (dark/light)
- Notification preferences (placeholder)
- Logout

### Gaps
| Gap | Impact | Priority |
|-----|--------|----------|
| **No notification preferences** — can't mute ticket/escalation types | User control | P1 |
| **No biometric lock** (Face ID / fingerprint) | Security gap | P1 |
| **No offline mode toggle** | User control | P2 |
| **No language/locale selection** | i18n gap | P2 |
| **No data/privacy settings** (export my data, delete account) | GDPR gap | P1 |
| **No version info** visible in settings | Support gap | P2 |

---

## 10. Escalation

### Current State
- Hierarchy list view
- Create/Edit modals
- Employee picker + time selection

### Gaps
| Gap | Impact | Priority |
|-----|--------|----------|
| **No escalation rule preview** — what happens when SLA breaches | Transparency gap | P1 |
| **No escalation test/simulation** | Admin confidence gap | P2 |
| **No WhatsApp/SMS escalation** toggle (web has it) | Channel gap | P1 |
| **No escalation history/log** view | Audit gap | P2 |

---

## 11. Missing User Flows

| Missing Flow | Impact | Priority |
|-------------|--------|----------|
| **User invite flow** — invite tenant/vendor to property | B2B gap | P0 |
| **Ticket creation flow** — end-to-end on mobile | P0 |
| **Checklist creation** — admin creates checklist template on mobile | P1 |
| **Shift scheduling** — MST/staff shift management on mobile | P1 |
| **Announcements** — org-wide notices to tenants | P1 |
| **Feedback/rating** — tenant rates completed ticket | P2 |
| **Chat/in-app messaging** — between staff and tenant | P2 |
| **Document upload** — for compliance/contracts | P2 |

---

## 12. Enterprise Features

| Feature | Status | Priority |
|---------|--------|----------|
| **Multi-language (i18n)** | Not implemented | P1 |
| **Dark/Light mode** | Implemented | Done |
| **Offline mode** | Partial (cache-first queries, no mutations) | P0 |
| **Audit logs** | Not on mobile | P2 |
| **Custom branding** (white-label) | Not on mobile | P2 |
| **API rate limiting** (mobile awareness) | Not handled | P1 |
| **Role-based access control (RBAC)** | Server-side, mobile trusts it | P0 |
