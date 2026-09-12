---
title: Application security
purpose: Document the application-layer controls as implemented — authentication, sessions, authorization checks, input validation, rate limiting, uploads, and the web security posture.
audience: Engineering, security reviewers
scope: apps/web, apps/admin, apps/mobile, packages/services
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Application security

## Authentication

| Path | Mechanism | Notes |
|---|---|---|
| Google | Supabase Auth OAuth (PKCE); web callback `apps/web/src/app/(pages)/auth/callback/route.ts`; mobile native → `supabase.auth` | Redirect URLs must be allow-listed in Supabase |
| Phone OTP | `requestPhoneVerification` → Hubtel (server-only, `hubtelOtpClient.ts`); state in `phone_otp_state` (5-min TTL, 60 s resend, 5 attempts); `verifyPhoneSignIn` → `phoneAuthCore.verifyPhoneOtpAndResolveUser` → find-or-create `auth.users` by phone (`get_auth_user_id_by_phone`, service-role only) → one-time password minted and immediately rotated → `signInWithPassword` on the SSR cookie client (web) / tokens returned to the app | The client never sees Hubtel's request id/prefix; per-IP send cap 10/h (`phone_otp_send_log`) |
| Email OTP | Supabase `signInWithOtp` (6 digits) with app-level per-email and per-IP send caps (`emailAuthCore.ts`, `consume_rate_limit`); enumeration-safe copy | Verify is client-direct on mobile |
| Admin | Google only + `ADMIN_EMAIL_ALLOWLIST` + `admin_user.status='active'` + roles; step-up token (`stepUpToken.ts`, HMAC, user-bound, 10 min) | No phone/email path in the console |

Account linking relies on Supabase semantics (same verified email → same account). No MFA for end users.

## Sessions

- **Web:** Supabase SSR cookies refreshed in `apps/web/src/proxy.ts` → `config/supabase/middleware.ts` (`updateSession`). Public-path allowlist; everything else redirects to sign-in. Suspended/banned → `/account-restricted`. `/api/mobile/**`, `/api/observability/**`, `/api/notifications/**`, `/api/paystack/webhook` are excluded from the cookie middleware.
- **Mobile:** tokens in `expo-secure-store` (chunked); `Authorization: Bearer` to `/api/mobile/**`; `getMobileAuth` (`api/mobile/_lib/authedClient.ts`) validates via `auth.getUser()`, checks `status_id`, returns an **anon-key** client carrying the token so RLS applies. Install id header `x-abonten-install-id` recorded as a fraud signal only.
- **Revocation:** suspend/ban → `auth.admin.signOut(user, 'global')`; sign-out on a device removes its push token.

## Authorization

- Every Server Action re-checks `auth.getUser()` and returns `{status: 401}` without a user.
- Services take the resolved `userId`; ownership checks precede any service-role write (pattern documented in `@abonten/services` README).
- Admin: `requireAdmin()` + `assertPermission` per service function + `assertStepUpFresh` for the 13 sensitive permissions.
- Field programme: `resolveFieldOpsContext` + `requireMembership(role)`; campaign-status gates; admins refused as members.

## Input validation

zod schemas in `packages/validation` (`adminSchemas`, `fieldOpsSchemas`, `messageSchema`, event/place/review schemas) at the transport boundary; `@abonten/core` pure validators (checkout limits, pricing, phone normalisation, email checks). The database adds CHECK constraints on money/inventory columns (DATA-002) and UNIQUE on `ticket.ticket_code`.

## Rate limiting

Postgres primitive `consume_rate_limit(key, limit, window)` (fixed window, service-role only) via `checkRateLimit()`; **fails open** on infrastructure error (logged). Keys: geocode per IP; promo lookup 20/min; checkout validate 30/min; Cloudinary signature per minute; place visit 10/5 min; event share 60/h; referral touch 30; referral bind 5/h; referral resolve 20; promoter commission 20; email OTP per email and per IP; field OTP 20/h; field consent 30/h per IP; admin broadcast per hour; review posts per hour. Count-based: reports 10/h; phone OTP sends 10/h per IP. Hubtel/Supabase enforce their own limits.

## Uploads and media

Direct-to-Cloudinary uploads with **server-signed** parameters scoped to the user's folder (`cloudinaryUploadSignature.ts`; field-ops checks the folder at submission). Size limits in `@abonten/core/uploadLimits`. Private Supabase buckets for claim documents, report attachments, message attachments and field evidence, served by short-lived signed URLs. Highlight video delivery via `highlightVideoDelivery.ts`.

## Web security posture

- **CSRF:** Next.js Server Actions require the framework's action id and same-origin checks; the admin console additionally requires step-up for sensitive actions. Webhook endpoints verify provider signatures.
- **XSS:** React rendering; the Markdown renderer for public documents produces React elements, never HTML strings; user content is rendered as text.
- **Clickjacking / indexing:** admin sends `X-Robots-Tag: noindex, nofollow`. (No CSP or frame-ancestors header is configured — improvement item.)
- **Secrets in the browser:** only `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` values ship; `@abonten/services` is server-only and never imported from client components.
- **Error reporting:** Sentry `sendDefaultPii:false`; admin `beforeSend` scrubs cookies, headers, tokens, card-like fields; self-hosted error ingest authenticated by `OBSERVABILITY_INGEST_SECRET`.

## Improvement items

CSP / security headers on web and admin; MFA for admins beyond re-authentication; regression tests for SECURITY DEFINER authorization; purge of media for deleted accounts.
