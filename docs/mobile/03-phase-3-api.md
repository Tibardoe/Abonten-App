# Phase 3 — Mobile HTTP API layer

`apps/web/src/app/api/mobile/**` — the endpoints the Expo app calls for
anything that needs a server (a secret, service-role, or a mutation the app
should not do straight against Supabase). Everything else (event/place
discovery, favourites, tickets, review reads) the app does **direct to
Supabase under RLS** — no endpoint.

## Auth model

Mobile has no cookies. It keeps the Supabase access/refresh tokens in
`expo-secure-store` and sends `Authorization: Bearer <access_token>` on every
request. `_lib/authedClient.ts` `getMobileAuth(req)` puts that token on a
plain `supabase-js` client, so `auth.getUser()` **and** RLS behave exactly as
for a cookie session — same token, different transport. Only the public URL +
anon key are used; nothing secret. Service-role stays isolated behind the
per-feature cores (`serviceClient.ts`, `phoneAuthCore.ts`).

`_lib/response.ts` — `{ status, message?, data? }` envelope, HTTP status
mirrors `status` (matches the Server Action convention).

## "No logic fork" rule

A route never re-expresses an action's logic. The action's post-auth body is
lifted into a plain `(supabase, userId, …)` helper that **both** the existing
`"use server"` action and the route call. Web behaviour is unchanged — the
action keeps doing its own cookie `createClient()` + `getUser()` and then
calls the shared helper.

## Status — done

| Sub-step | Endpoints | Shared core | Commit |
|---|---|---|---|
| 3.1 | `GET notifications`, `POST notifications/read`, `POST notifications/read-all`, `GET profile` | `utils/notificationsQuery.ts` | `8a437b6` |
| 3.2 | `POST auth/phone/request`, `POST auth/phone/verify` | `services/phoneAuthCore.ts` | `2ac118a` |
| 3.3 | `POST uploads/signature` | `utils/cloudinaryUploadSignature.ts` | `33df763` |
| 3.4 | `@abonten/api-client` typed client | — | `ee85122` |

### 3.1 notifications + profile

`fetchNotificationsPage` / `markNotificationReadFor` / `markAllNotificationsReadFor`
now back both `getUserNotifications` / `markNotificationRead` /
`markAllNotificationsRead` and the routes. `GET /api/mobile/profile` mirrors
the existing cookie route `src/app/api/user-profile/route.tsx`
(`user_profile_details` view, keyed by `user_id`).

### 3.2 phone auth (token-returning)

`phoneAuthCore.ts` holds the transport-neutral sequence moved verbatim from
`verifyPhoneSignIn.ts`:

- `verifyPhoneOtpAndResolveUser(phoneE164, code)` — format check, pending-OTP
  lookup, attempt budget, Hubtel verify, consume code, find-or-create the
  Supabase user.
- `issueOneTimePassword(userId)` — admin one-time password (kept the "not
  rotated after sign-in" property; rotating revokes the just-made session).

`verifyPhoneSignIn.ts` (web) calls the core then does the SSR
`signInWithPassword` that writes auth cookies — signature and behaviour
unchanged. `POST /api/mobile/auth/phone/verify` calls the same core then
does a **session-less** `signInWithPassword` and returns
`{ access_token, refresh_token, expires_at, expires_in, token_type, user,
isNewUser }` for `expo-secure-store`. Same session-minting technique, same
service-role isolation.

`POST /api/mobile/auth/phone/request` calls `requestPhoneVerification`
unchanged (per-phone cooldown + per-IP cap already inside it). Both phone
routes are unauthenticated by design — pre-login, same as the web AuthModal.

### 3.3 upload signatures

`buildCloudinaryUploadSignature(userId, kind)` for the five kinds (`avatar`,
`highlight`, `place_photo`, `event_review_photo`, `place_review_photo`).
`CLOUDINARY_API_SECRET` never leaves the server; the folder is
`<prefix>/<user id>` and signed. The five `get*UploadSignature` actions keep
only their auth check + own 401 copy and delegate. A shared
`UploadSignatureResult` discriminated union preserves how `useAvatarUpload.ts`
etc. narrow on `status`.

### 3.4 `@abonten/api-client`

`createApiClient({ baseUrl, getAccessToken, fetch? })` — `getAccessToken` is
awaited per request (refreshed token always used); phone-auth methods skip
it. Methods: `auth.requestPhoneOtp` / `auth.verifyPhoneOtp`,
`notifications.list` / `markRead` / `markAllRead`, `profile.get`,
`uploads.signature`. Returns the `{ status, … }` envelope (or
`PaginatedResult` for the list); only transport/parse failures throw
(`ApiTransportError`). Depends on `@abonten/types` only.

## Deferred — checkout + payments endpoints

`validateCheckout`, `prepareMultiCheckoutPayment`,
`createMultiCheckoutPaymentAttempt`, `verifyPaystackPayment`, the Paystack
direct-charge / mobile-money-OTP actions, and `submitPaystackChargeOtp` are
**not** wrapped yet. Reasons:

1. They are money-critical — a core-extraction bug has real financial impact,
   so each deserves its own reviewed commit.
2. `validateCheckout` alone is a ~200-line extraction touching inventory
   reservation + promo claims.
3. Mobile payment UX differs fundamentally (Paystack has its own React Native
   SDK; there is no web popup). The endpoint shapes should be designed
   against the actual mobile checkout screen.

These move to a dedicated **Phase 5 checkout vertical slice**, built with the
mobile checkout UI so the contract is designed once, correctly. The SECURITY
DEFINER money RPCs still need the audit noted in
`00-phase-0-findings.md` before broad direct-RPC exposure.

## Verification

`turbo run build` then `turbo run typecheck` green after every sub-step
(run sequentially — `next build` regenerates `.next/types`, which a parallel
`tsc` can read mid-write). 7 mobile routes registered as dynamic; 33/33
static pages; `ƒ Proxy (Middleware)` unchanged. No DB migration, no
RLS/env/dependency change. Biome clean on touched files.
