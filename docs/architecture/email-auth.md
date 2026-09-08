# Email OTP sign-in

_Added 2026-09-08. Third end-user sign-in option: **Continue with email**, alongside Google and phone._

---

## 1. How it works

```
user enters email
   ↓  requestEmailOtp (web action) / POST /api/mobile/auth/email/request
   ↓  requestEmailOtpCore:  validate → per-email + per-IP send cap → supabase.auth.signInWithOtp({ email, shouldCreateUser: true })
Supabase emails a 6-digit code   (Supabase issues, hashes, expires, single-uses it)
   ↓  user types the code
   ↓  web:    verifyEmailSignIn action → verifyOtp on the SSR cookie client → auth cookies on the response → full-page nav
   ↓  mobile: supabase.auth.verifyOtp on the native client → session persisted to expo-secure-store → SessionProvider routes in
on_auth_user_created trigger has already made the public.user_info row (status_id = 1)
   ↓
profile-completion notification (idempotent) → app
```

- **No magic link.** Only the numeric code. See §4 for why.
- **No `emailRedirectTo`.** Nothing in this flow puts a token or a redirect target in a URL. The link Supabase still includes in the email points at the Site URL and is inert for us.
- **The app never generates an auth token and never stores email-OTP state.** (Phone auth needs `phone_otp_state` because Hubtel owns that lifecycle; Supabase owns the email one.)

## 2. Code map

| Concern | File |
|---|---|
| Shared helpers (`EMAIL_OTP_CODE_LENGTH = 6`, `isLikelyEmail`, `normalizeEmail`, `maskEmail`, `EMAIL_OTP_MESSAGES`) | `packages/core/src/emailOtp.ts` |
| Transport-neutral core (`requestEmailOtpCore`, `verifyEmailOtpCore`) | `packages/services/src/profile/emailAuthCore.ts` |
| Web send | `apps/web/src/actions/requestEmailOtp.ts` |
| Web verify (establishes the cookie session) | `apps/web/src/actions/verifyEmailSignIn.ts` |
| Web sign-in UI | `apps/web/src/components/organisms/AuthModal.tsx` |
| Web Settings → add/change email | `apps/web/src/components/organisms/SecurityInputFields.tsx` |
| Mobile send route | `apps/web/src/app/api/mobile/auth/email/request/route.ts` |
| Mobile api-client method | `packages/api-client/src/client.ts` (`auth.requestEmailOtp`) |
| Mobile enter-email screen | `apps/mobile/app/(auth)/email.tsx` |
| Mobile OTP screen (shared phone/email, `channel` param) | `apps/mobile/app/(auth)/verify.tsx` |
| Mobile sign-in entry button | `apps/mobile/app/(auth)/sign-in.tsx` |
| Mobile Settings → add/change email | `apps/mobile/app/(app)/settings/security.tsx` |
| Unit tests | `packages/core/src/emailOtp.test.ts`, `packages/services/src/profile/emailAuthCore.test.ts` |
| Integration tests | `packages/services/src/__integration__/email-auth.integration.test.ts` |

## 3. Supabase configuration

Read via SQL only shows identities; the settings below live in the **Auth service config** (dashboard) and must be set by hand.

| Setting | Where | Value / note |
|---|---|---|
| Email provider | Auth → Providers → Email | Enabled (default). |
| **Custom SMTP** | Auth → SMTP Settings | **Required for production.** `smtp.resend.com` : `465`, user `resend`, pass = a Resend API key, sender e.g. `no-reply@abontenhub.com`, name `Abonten`. The built-in sender caps at ~2–4 emails/hour — unusable. The Resend API key lives **only here**, never in an app env. |
| "Magic Link" email template | Auth → Email Templates | Add a `{{ .Token }}` block. This is the template an **existing** user gets when they request a sign-in code. Abonten branding, an expiry line, "If you didn't request this, you can ignore this email." |
| "Confirm signup" email template | Auth → Email Templates | Also add `{{ .Token }}`. This is the template a **brand-new** email user gets on their first `signInWithOtp` (`shouldCreateUser: true`). Miss this and first-time sign-ups get an email with a link but no code. |
| "Confirm email change" template | Auth → Email Templates | Also add `{{ .Token }}` — the Settings "add/change email" flow verifies with a 6-digit code (`type: 'email_change'`), not the link. |
| Email OTP expiry | Auth → Providers → Email | 600 s (10 min) recommended. Max allowed is 86400. |
| `enable_signup` (global) + email signup | Auth | **On** — `shouldCreateUser: true` needs it for first-time email users. |
| Confirm email | Auth → Providers → Email | Not relevant to OTP sign-in (the code itself confirms). Keep as-is for the change-email flow. |
| Rate limits — `token_verifications` | Auth → Rate Limits | Default 30 / 5 min / IP is fine (6-digit + 10-min expiry + single-use). |
| Rate limits — `email_sent` | Auth → Rate Limits | With custom SMTP this can be raised well above the built-in default. |
| Manual linking (`enable_manual_linking`) | Auth → Providers | Leave **off** — the design does not use `linkIdentity()` for email. |

### Redirect URLs

**Unchanged.** Email OTP uses no redirect. Keep the existing Site URL + allow-list (`https://abontenhub.com`, Vercel previews, `http://localhost:3000`). Do **not** add `abonten://` for this feature.

## 4. Why OTP and not magic link

| | Email OTP | Magic link |
|---|---|---|
| Cross-device (enter email on laptop, open mail on phone) | works — type the code on the laptop | breaks under PKCE (no `code_verifier` in the second browser); needs a `token_hash` `/auth/confirm` route |
| Mobile | no deep-link dependency | Gmail/Outlook in-app browsers, link-preview bots consuming one-time links, App Link verification edge cases |
| Security surface | no `emailRedirectTo`, no token in URL → no open-redirect vector | adds a redirect allow-list + a callback parser to audit |
| Reuses existing app code | `OtpInput`, `ResendOtpButton`, masking, the phone-OTP screen shape (web + native) | new callback routes + template `ConfirmationURL` wiring + `+native-intent` auth branch |

The email template is shared, so a link can be added later with no rework — the expensive part (reliable link consumption on mobile) is what's deferred.

## 5. Account linking

Relies entirely on Supabase's supported identity semantics — **no custom merge logic**.

| Scenario | Result |
|---|---|
| New email address | Supabase creates the `auth.users` row → trigger creates `user_info` → onboarding. |
| Returning email user | Same row, existing profile. |
| Google user → later Email OTP, **same verified email** | Supabase **auto-links** the `email` identity to the existing user → one account. |
| Phone-only user + email | No shared key, so no auto-link. Unify via **Settings → Security → Add email**: `updateUser({ email })` → `verifyOtp({ type: 'email_change' })`, on the live session, **no sign-out**. |
| Two people, same email | Impossible — `auth.users.email` is unique. |

Recovery: email is **additive**. Losing the phone but keeping a linked email still gets you in; losing email but keeping the phone still works. Email never becomes the sole factor. Replacing a verified identity always requires an authenticated session + a fresh code.

## 6. Rate limiting

| Layer | Limit | Enforced by |
|---|---|---|
| Per email address | 3 code sends / 15 min | app — `consume_rate_limit` RPC, key `email-otp:send:<sha256(email)[:32]>` (raw address never stored) |
| Per caller IP | 15 sends / hour | app — `consume_rate_limit`, key `email-otp:send:ip:<ip>` |
| Provider send | `email_sent` (dashboard) | Supabase |
| Code verification | `token_verifications` — 30 / 5 min / IP | Supabase |
| Code guessing | 6 digits, 10-min expiry, single-use | Supabase |

App-level checks **fail open** (a broken limiter must never block a legit user) and log the failure. The client-side resend cooldown (30 s mobile / 60 s web) is **UX only** — never a security control.

## 7. Security notes

- **Enumeration:** every user-facing string is generic ("If that email can receive mail, we've sent a code" / "That code isn't correct" / "That code has expired"). `shouldCreateUser: true` means the send response doesn't branch on whether the account exists. Provider error text is never forwarded to the client; it's logged server-side only.
- **No logging of:** the code, the email in full (only `maskEmail` for display), access/refresh tokens. `logger.error` lines carry a category + status, nothing sensitive. Sentry: send `{ flow: "email-otp", platform, step, errorCategory, status }` — no email, no code.
- **RLS / roles:** unchanged. A verified email yields `status_id = 1` and nothing else. Roles stay data-driven (event/place ownership) and admin stays `admin_user` + allowlist. Covered by `email-auth.integration.test.ts` (AUTH-EMAIL-016) and the existing SEC-001 suite.
- **Mobile:** session in `expo-secure-store` (chunked adapter), same as Google/phone. No token ever crosses `/api/mobile` for email verify.
- **Admin app:** untouched — Google-only + `ADMIN_EMAIL_ALLOWLIST` + `resolveAdminContext` + step-up.

## 8. Environment variables

**None added.** Web/mobile/admin already carry `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_*`. The Resend SMTP credential is dashboard-side only and is never bundled into any client.

## 9. Database changes

**None.** The `on_auth_user_created` trigger, RLS, and the `consume_rate_limit` RPC already support this path.

## 10. Testing

- `npm run test -w @abonten/core` — `emailOtp` helpers (16 tests).
- `npm run test -w @abonten/services` — `emailAuthCore` validation + enumeration-safe mapping with a stubbed client (9 tests).
- `npm run test:db:up` then `npm run test:integration -w @abonten/services` — `email-auth.integration.test.ts` (6 tests): new-user profile creation, no-duplicate-account, session-preserving email change, `consume_rate_limit` cap, RLS still binds an email-authed user. Requires Docker.
- Manual: web `AuthModal` (Chrome + mobile viewport) and Android emulator — new user, returning user, wrong code, expired code, resend, refresh, logout, restart.

## 11. Production checklist

- [ ] Custom SMTP (Resend) configured in Supabase Auth → SMTP, and a test email received.
- [ ] `abontenhub.com` sender has valid SPF + DKIM + DMARC in Resend.
- [ ] `{{ .Token }}` added to both the "Magic Link" and "Confirm email change" templates, branded.
- [ ] Email OTP expiry set (≤ 600 s).
- [ ] Global + email signup enabled.
- [ ] Smoke test on production: new email → code → in; existing Google email → code → same account (verify one `auth.users` row).
- [ ] Regression: Google sign-in, phone sign-in, logout, session restore all still work.

## 12. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Server log `requestEmailOtpCore: signInWithOtp failed: Error sending magic link email` (user sees the generic message) | Supabase's SMTP send failed. Check the real reason in **Supabase → Logs → Auth** (`error` field on the `/otp` request). Common: `535 "Invalid username"` → the Custom SMTP **Username** is wrong — for Resend it must be the literal word `resend` (lowercase, no spaces) and the **Password** must be a full `re_…` API key. `Error sending … email` with no SMTP configured → built-in sender refused a non-team address / hit its hard cap. This is the #1 setup blocker. |
| No email arrives, send returns 200 | Built-in sender hit its ~2–4/hour cap. Configure Resend SMTP. |
| Email arrives with a link but **no code** | `{{ .Token }}` missing from the relevant template — "Confirm signup" for a first-time user, "Magic Link" for a returning user, "Confirm email change" for the Settings flow. |
| "Too many requests" almost immediately | App per-email cap (3/15 min) or Supabase `email_sent`. Expected under repeated retries; wait it out. |
| Verify always says "incorrect" for a fresh code | Clock skew, or the code was already consumed (single-use) by a duplicate submit. Request a new one. |
| Settings "Add email" verify fails for a Google user | `double_confirm_changes` is on — the user must also enter the code sent to their **current** address. The UI says so. |
| New email user has no profile | Check the `on_auth_user_created` trigger and that `public.user_status` is seeded (see `supabase/seed.sql`). |

## 13. Reverting / disabling

- **Turn it off fast:** disable the Email provider in Supabase Auth → Providers. Both apps still show the button, but sends will fail with the generic error. For a clean removal, hide the "Continue with email" button in `AuthModal.tsx` and `app/(auth)/sign-in.tsx`.
- **Change the send caps:** the constants at the top of `packages/services/src/profile/emailAuthCore.ts`.
- **Rotate the Resend SMTP key:** Supabase Auth → SMTP settings only; nothing else references it.
