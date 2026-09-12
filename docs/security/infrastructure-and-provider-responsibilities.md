---
title: Infrastructure and provider responsibilities
purpose: State, per provider, what Abonten relies on them for, what they secure, what Abonten must secure, and where the configuration lives.
audience: Engineering, founder
scope: Vercel, Supabase, Cloudinary, Paystack, Hubtel, Resend, Google, Expo/EAS, Firebase, Sentry, GitHub
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: yes
---

# Infrastructure and provider responsibilities

| Provider | They secure | We must secure | Config location |
|---|---|---|---|
| **Vercel** (web `abonten`, admin `abonten-app-admin`, region `cdg1`) | Platform, TLS, edge network, build isolation | Env vars (server secrets never `NEXT_PUBLIC_`), deployment protection settings, domain/DNS, who has Vercel access | Vercel project settings; `apps/*/vercel.json` |
| **Supabase** (Postgres 17, Auth, Storage, pg_cron, Realtime; EU Paris) | Managed Postgres, Auth service, storage encryption at rest, backups per plan | RLS policies and grants, function privileges, Auth settings (redirect URLs, SMTP, rate limits, leaked-password protection — currently off, SEC-003), bucket policies, service-role key custody, Vault for cron secrets (SEC-004 pending), Postgres patch level | Supabase dashboard; `supabase/migrations/`; `supabase/config.toml` (local) |
| **Cloudinary** | Storage, CDN, transformation | Signed uploads per user folder, API secret custody, cleanup of orphaned/deleted media | `CLOUDINARY_*` env; `cloudinaryUploadSignature.ts` |
| **Paystack** | Card data, PCI DSS, payment network, dispute handling | Secret key custody, webhook secret, verify-before-fulfil, transfer flag, dashboard access | Vercel env; Paystack dashboard |
| **Hubtel** | SMS delivery, OTP code lifecycle | Client id/secret custody, attempt budgets, never exposing codes | `HUBTEL_API_CLIENT_ID/SECRET` |
| **Resend** | Email delivery, DKIM/SPF signing | API key custody, domain DNS records, suppression handling, unsubscribe headers (implemented for rewards) | `RESEND_API_KEY`; Supabase Auth SMTP setting |
| **Google** | OAuth, Maps/Geocoding APIs | OAuth client secret custody (used by Supabase), Maps key restrictions (HTTP referrers / Android package), quota | `GOOGLE_CLIENT_*`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_API_KEY` (admin geocoding) |
| **Expo / EAS** | Build infrastructure, push relay, OTA distribution | EAS account access, `EXPO_PUBLIC_*` env (no secrets), signing keystore (`*.jks` gitignored), update channel discipline, `EXPO_ACCESS_TOKEN` custody | EAS project `c0a45056-…`; `eas.json` |
| **Firebase (FCM)** | Android push transport | `google-services.json` is client config (tracked; decision S4); Admin SDK keys are gitignored and must stay out of the repo | `apps/mobile/google-services.json` |
| **Sentry** (org `abonten-hub`; projects web/admin/mobile) | Event storage, access control | DSN exposure is acceptable (public by design); `SENTRY_AUTH_TOKEN` server/CI only; PII scrubbing (`sendDefaultPii:false`, admin `beforeSend`); retention per plan | Vercel env, EAS secret, `sentry.*.config.ts` |
| **GitHub** | Repo hosting, Actions runners | Branch protection, CI secrets (all build secrets live there), reviewer discipline | `.github/workflows/*` |

## Network and transport

All public traffic is HTTPS (Vercel-managed certificates). Supabase and provider APIs are called over TLS. No VPN or private network exists; database access from outside Supabase is by the service-role/anon keys and the dashboard.

## Access to production

- Vercel, Supabase, Paystack, Cloudinary, Resend, Hubtel, Sentry, EAS and GitHub accounts are held by the founder (single-person operation today). Decision S1 (on-call) and S3 (rotation) apply. Recommend: individual accounts per person, 2FA everywhere, and an access register.

## Regions and data residency

Supabase project and Vercel functions in Paris (EU). Other providers global/US. Cross-border transfer analysis: legal item B2.
