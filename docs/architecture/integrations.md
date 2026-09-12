---
title: External integrations
purpose: For each external service — what Abonten uses it for, the code that calls it, configuration, health monitoring, and behaviour when it fails.
audience: Engineering, operations
scope: Supabase, Vercel, Cloudinary, Paystack, Hubtel, Resend, Google, Expo/FCM, Sentry
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# External integrations

| Service | Used for | Code | Config (names) | Health probe | On failure |
|---|---|---|---|---|---|
| **Supabase** | Postgres + RLS, Auth (Google, phone via custom flow, email OTP), Storage (4 private buckets), pg_cron, Realtime (messaging) | `apps/web/src/config/supabase/{client,server,middleware,publicClient}.ts`; `packages/services/src/supabase/{serviceClient,publicClient}.ts`; `apps/mobile/src/lib/supabase.ts`; `apps/admin/src/lib/supabaseServer.ts` | `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `EXPO_PUBLIC_SUPABASE_*` | `db`, `auth`, `storage` | Everything degrades; see outages runbook |
| **Vercel** | Hosting web + admin, serverless functions, edge middleware (`proxy.ts`), `x-vercel-ip-country` header | `vercel.json` (`cdg1`), `next.config.ts` | Vercel env | `self` (cron reaching the web app) | Site down |
| **Cloudinary** | Media storage/CDN: avatars, flyers, place photos, highlights (image/video), message attachments, ticket QR images | `packages/services/src/uploads/cloudinaryUploadSignature.ts`, `apps/web/src/utils/uploadToCloudinary.ts`, `apps/mobile/src/lib/cloudinaryUpload.ts`, `@abonten/core/cloudinaryUrl.ts`, destroys in mutation cores | `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY/SECRET`, `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` | `cloudinary` (ping) | Uploads fail; images may be missing |
| **Paystack** | Payments (popup, charge authorization, MoMo charge + OTP), verify, refunds (partial), disputes webhook, transfers (flag off) | `packages/services/src/payments/gateway/paystackService.ts`, `paystackTransfer.ts`, `payments/*`; `apps/web/src/app/api/paystack/webhook/route.ts`; `usePaystackPopup.ts` | `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`, `PAYSTACK_TRANSFERS_ENABLED` | `paystack` (`/bank`) | Payments fail at init/verify; attempts pending → reaper/retry |
| **Hubtel** | SMS one-time codes (sign-in, phone change, field owner consent) | `packages/services/src/profile/hubtelOtpClient.ts`, `phoneOtpStore.ts`, `phoneAuthCore.ts`, `fieldOps/member/ownerOtpCore.ts` | `HUBTEL_API_CLIENT_ID/SECRET` | `hubtel` (auth ping) | Phone sign-in unavailable; other methods work |
| **Resend** | Transactional email (tickets with PDF, cancellations, reward updates with List-Unsubscribe); Supabase Auth SMTP for sign-in codes | `apps/web/src/actions/ticketPurchaseNotification.ts`, `eventCancellationNotification.ts`, `apps/web/src/utils/sendRewardUpdateEmail.ts`, `packages/services/src/notifications/deliveryCore.ts` | `RESEND_API_KEY`; Supabase SMTP settings | `resend` (`/domains`) | Emails skipped/queued; in-app notices unaffected |
| **Google** | OAuth provider (via Supabase), Maps JS (web), Geocoding (`/api/geocode`, admin territories), Places autocomplete, Android Install Referrer | `GoogleAuthButton.tsx`, `apps/web/src/app/api/geocode/route.ts`, `geocodeServerSide.ts`, `usePlacesAutocomplete.ts`, `apps/mobile/src/features/rewards/inviteCapture.ts` | `GOOGLE_CLIENT_*` (Supabase), `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_API_KEY`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | — | Maps blank; Google sign-in fails |
| **Expo / FCM** | Push delivery (`exp.host` API; FCM on Android), EAS Build/Update | `packages/services/src/notifications/sendPushNotification.ts`, `deviceTokenCore.ts`; `apps/mobile/src/features/notifications/usePushRegistration.ts`; `google-services.json` | `EXPO_ACCESS_TOKEN` (optional); EAS env | `expo` | Pushes fail; queue retries |
| **Sentry** | Error monitoring web/admin/mobile, source maps | `apps/web/src/instrumentation*.ts`, `sentry.{server,edge}.config.ts`, `apps/admin/src/lib/sentry.ts`, `apps/mobile/src/lib/sentry.ts`, `withSentryConfig` | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `EXPO_PUBLIC_SENTRY_DSN` | — | Self-hosted error groups still record |
| **GitHub Actions** | CI | `.github/workflows/checks.yml`, `integration-tests.yml` | repo secrets | — | — |

## Not integrated (despite traces)

Twilio (removed), Flutterwave (never), NextAuth (env vars vestigial), analytics products (none), Firebase Admin SDK (none; only client config).

## Adding an integration

1. Server-side only through `@abonten/services`; secrets never `NEXT_PUBLIC_`/`EXPO_PUBLIC_`.
2. Add a health probe in `runHealthChecksCore.ts` and document the key here and in `../admin/dashboard.md`.
3. Add the provider to `../privacy/third-party-processors.md` and the Privacy Policy (version bump).
4. Add env names to `../security/secrets-and-environment.md`, `.env.example` files and CI.
5. Add a row to the outages runbook.
