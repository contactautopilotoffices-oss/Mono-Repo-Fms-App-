# SECURITY GAPS — Mobile App Audit

---

## 1. Authentication

| Gap | Risk | Severity | Fix |
|-----|------|----------|-----|
| **No biometric auth** — Face ID / fingerprint | Device access = full access | High | `expo-local-authentication` |
| **No 2FA / OTP** | Password = only barrier | Critical | TOTP or SMS OTP |
| **Password min 6 chars** | OWASP min is 8 | High | Enforce 8+ chars + complexity |
| **No login attempt throttling** | Brute force risk | High | Server-side rate limiting |
| **No session timeout** | Stale sessions stay alive | Medium | 24h inactivity = logout |
| **No device fingerprinting** | Can't detect stolen sessions | Medium | Send device_id on login |
| **No concurrent session detection** | Multi-device = no visibility | Low | Track active sessions |
| **No "remember this device"** | Re-auth every 7 days | Low | Encrypted device token |

---

## 2. Authorization

| Gap | Risk | Severity | Fix |
|-----|------|----------|-----|
| **Mobile trusts server RBAC** | If server bypassed, mobile has no guard | Critical | Client-side role checks too |
| **`property_memberships` not validated on mobile** | No local role check | High | Validate role before showing UI |
| **No feature flags per role** | UI renders then fails | Medium | Role-gated feature flags |
| **Admin actions on mobile** — no extra confirmation | Accidental admin acts | Medium | Re-auth for destructive actions |
| **No row-level security awareness** | Can't show "access denied" inline | Low | Graceful degradation |

---

## 3. Data Storage

| Gap | Risk | Severity | Fix |
|-----|------|----------|-----|
| **No encrypted MMKV** | Device root = data exposed | High | `MMKV.withEncryption()` |
| **Sensitive data in logs** | `console.log` statements expose PII | High | Remove logs in prod, use Sentry |
| **No secure storage for tokens** | AsyncStorage is plain text | High | Already using MMKV (good) |
| **Session token not invalidated on password change** | Old sessions stay alive | Medium | Token rotation on password change |
| **No data wipe on logout** | Partial logout leaves cache | Medium | Clear MMKV on logout |
| **No certificate pinning** | MITM on public WiFi | Medium | `expo-crypto` + CA pinning |

---

## 4. API Security

| Gap | Risk | Severity | Fix |
|-----|------|----------|-----|
| **API base URL in env** — readable in binary | Not truly secret | Low | Already in env, acceptable |
| **No request signing** | Replay attacks possible | Medium | Add timestamp + nonce |
| **No request timeout** | Slow-loris possible | Low | Add 30s timeout |
| **Bearer token in URL params** — for some calls | Logs expose token | Medium | Use headers only |
| **No API versioning** | Breaking changes cascade | Low | `/api/v1/` prefix |

---

## 5. Privacy

| Gap | Risk | Severity | Fix |
|-----|------|----------|-----|
| **No GDPR consent banner** | EU compliance risk | High | Opt-in for analytics |
| **No data export** (user downloads their data) | GDPR right | High | `/api/users/export` endpoint |
| **No account deletion** (mobile flow) | GDPR right | High | Soft delete + cleanup job |
| **Analytics without consent** | Privacy violation | High | Consent gate for any tracking |
| **No privacy policy in-app** | App Store rejection risk | Medium | Deep link to web policy |
| **Location tracking** — not implemented | Good, but note it | OK | Keep it absent |

---

## 6. Dependency Security

| Dependency | Known CVEs | Fix |
|------------|-----------|-----|
| Check `npm audit` output | Unknown | `npm audit fix` |
| Outdated Expo SDK | Security patches missed | `expo upgrade` |
| `@react-native-firebase/messaging` | Check Firebase release notes | Keep updated |
| `expo-notifications` | Check release notes | Keep updated |
