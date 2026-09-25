---
title: Secrets and environment variables
purpose: The complete list of environment variables by app (names only), where each is set, what breaks without it, and the rotation procedure.
audience: Engineering, founder
scope: apps/web, apps/admin, apps/mobile, packages/services, CI, Supabase-side secrets
status: Approved
version: 1.3
lastReviewed: 2026-09-25
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Secrets and environment variables

**Never** write a value into this or any document, commit a `.env*` file (gitignored except `.env.example`), or prefix a secret with `NEXT_PUBLIC_` / `EXPO_PUBLIC_` (those are bundled into the browser/app).

**Retired 2026-09-24:** `PAYSTACK_TRANSFERS_ENABLED`. Automated payouts are now switched per market on the provider row (Admin › Markets › provider › Automated payouts, `market_payment_provider.payouts_enabled`), off for every market.

**Checked at boot (2026-09-19).** Each Next.js app's `src/instrumentation.ts` lists the variables it cannot run without and calls `checkEnv` / `enforceEnv` (`@abonten/core/env/checkEnv`) once per server process. In a production deployment (`VERCEL_ENV=production`) a missing required variable throws, so the deploy fails to start instead of failing at the first payment; in preview, CI and local development the missing names are logged. Web requires the Supabase pair and service-role key, `NEXT_PUBLIC_BASE_URL`, the Cloudinary trio, `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `OBSERVABILITY_INGEST_SECRET`; admin requires the Supabase pair and service-role key, `ADMIN_EMAIL_ALLOWLIST` and `OBSERVABILITY_INGEST_SECRET`. Everything else is "recommended" and only produces a warning.

**Preview deployments (2026-09-25).** Vercel Preview and Development builds of both apps use the **Abonten Preview** Supabase project (`qasxtirvfbreygsqwwat`; schema only, no production data): `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` exist twice (Production → production project; Preview + Development → preview project), `SUPABASE_SERVICE_ROLE_KEY` is Production-only until the preview project's own key is added for Preview, and the production URL/anon/service-role variables never target Preview again. Both apps refuse to start on a non-production deployment pointed at the production project (`@abonten/core/env/productionProject`). `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET` and `NEXTAUTH_URL` are read by no code and were neutralised (sensitive, marker value) — delete them when convenient. `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` were re-entered as *Sensitive* by the founder on 2026-09-25 (23:48 UTC); no variable on either project is flagged readable any more.

## apps/web (Vercel project `abonten`, also GitHub Actions `build-web`)

| Variable | Public? | Purpose | Without it |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase client | nothing works |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** | Service-role client for privileged writes | money path, notifications, admin-ish ops fail |
| `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_SITE_URL` | yes | Absolute links (emails, share, invite) | wrong links |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | yes (restrict by referrer) | Maps JS, geocode proxy | maps/geocoding fail |
| `GOOGLE_MAPS_API_KEY` | secret | Server geocoding (admin territories) | "Find on the map" fails |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | secret | Used by Supabase Auth Google provider (set in Supabase too); vestigial in build env | OAuth config |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | yes | Cloudinary URLs | media fails |
| `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | secret | Signed uploads, destroys, health probe | uploads fail |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET` | secret | Ghana's Paystack account: payments, refunds, webhook signature (the names Ghana's `market_payment_provider` row points at). **Both hold the same value** — Paystack signs webhooks with the secret key; a differing webhook value makes the registry refuse the account (2026-09-25) | Ghana payments fail / webhooks rejected |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | yes | Ghana's Paystack popup (returned per checkout by the server, not bundled) | popup fails |
| `PAYMENTS_MODE` | no (`live` / `test`) | The Paystack/Stripe mode this deployment must run in; a key of the other mode is refused. Set `live` on Production (web and admin) at the switch to live keys | unset: no declared mode (mixed keys are still refused) |

**Test and live.** The three Ghana Paystack variables must all be one mode — `PAYSTACK_WEBHOOK_SECRET` equals `PAYSTACK_SECRET_KEY` (Paystack signs webhooks with the secret key; the code refuses a different value). Live keys go on **Production only**: Preview deployments use the production database, so they get no Paystack keys once production is live — and the code refuses a live key on any deployment whose `VERCEL_ENV` is not `production`. With `PAYMENTS_MODE` set, a malformed key is refused too. Procedure: [../finance/paystack-live-cutover.md](../finance/paystack-live-cutover.md).
| Other markets' provider keys — `PAYSTACK_<CC>_SECRET_KEY`, `PAYSTACK_<CC>_WEBHOOK_SECRET`, `NEXT_PUBLIC_PAYSTACK_<CC>_PUBLIC_KEY` (NG, KE, ZA, CI); `STRIPE_SECRET_KEY_<GB|US|EU>`, `STRIPE_WEBHOOK_SECRET_<…>`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_<…>` | secret (public keys public) | **Names, not values, are stored** on each market's provider row (Admin › Markets); set a market's variables only when that market is being prepared. A market cannot be activated while its readiness check reports them missing | that market cannot activate; nothing else is affected |
| `HUBTEL_API_CLIENT_ID`, `HUBTEL_API_CLIENT_SECRET` | secret | Ghana SMS OTP (4-digit codes) | Ghana phone sign-in fails |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | secret | Phone OTP for markets whose `otp_provider` is `twilio` (6-digit codes) | phone sign-in refused there; Ghana unaffected |
| `OPEN_EXCHANGE_RATES_APP_ID` (name configurable in Admin › Markets › Exchange rates) | secret | Hourly display rates for “≈” estimates | estimates hidden; prices and charges unaffected |
| `RESEND_API_KEY` | secret | Transactional email | emails skipped (code is env-gated) |
| `OBSERVABILITY_INGEST_SECRET` | secret | `/api/observability/*` auth; must equal `observability_config.secret` in the DB | health/error ingest 401 |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `SENTRY_AUTH_TOKEN` | DSN public; token secret | Error monitoring; source-map upload (CI/Vercel only) | no Sentry events / no source maps |
| `REWARDS_KILL_SWITCH`, `FIELD_OPS_KILL_SWITCH`, `VERIFICATION_KILL_SWITCH` | flag | Emergency off switches | programmes follow DB settings |
| `SEARCH_V2_KILL_SWITCH`, `RECOMMENDATIONS_KILL_SWITCH` | flag | Discovery emergency stops: old search everywhere; no prompts, alerts, For you or new subscriptions | Discovery follows `discovery_program_setting` |
| `RECOMMENDATION_EMAIL_KILL_SWITCH` | flag | Stops recommendation email only: no opt-in, queued emails skipped | follows `discovery_program_setting.recommendations_email_enabled` (legal item G1) |
| `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY` | public / **secret** | VAPID key pair browsers subscribe with and pushes are signed with. Generate once (`npx web-push generate-vapid-keys`); rotating the pair invalidates every browser subscription | browser notifications hidden, nothing sent |
| `WEB_PUSH_SUBJECT` | config | Contact push services can reach (`mailto:` or `https:` URL) | browser notifications hidden, nothing sent |
| `SPOTLIGHT_KILL_SWITCH` | flag | Spotlight emergency stop: feeds, posting, promotions and links report it off on web and mobile | Spotlight follows `content_program_setting` |
| `STORIES_KILL_SWITCH` | flag | Stories emergency stop: the Stories row, viewer and posting report it off | Stories follow `content_program_setting` |
| `SPOTLIGHT_PROMOTIONS_KILL_SWITCH` | flag | Paid promotions emergency stop: no new promotions sold and no sponsored posts shown; organic Spotlight keeps working | follows `content_program_setting.spotlight_promotions_enabled` / `sponsored_delivery_enabled` |
| `WEEKLY_KILL_SWITCH` | flag | Abonten Weekly emergency stop: pages show the fallback, teaser and links hidden, mobile API reports it off | Abonten Weekly follows `weekly_program_setting` |
| `EXPO_ACCESS_TOKEN` | secret | Expo push API auth (optional) | pushes may be rate-limited |
| `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_VERCEL_ENV`, `VERCEL*`, `NODE_ENV`, `CI` | platform | Tagging | — |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | vestigial | No `next-auth` dependency; safe to remove (LOW-008) | — |
| `TWILIO_*` (history) | — | The unused `twilio` SDK was removed 2026-09-19; since 2026-09-24 Twilio Verify is called over plain HTTPS with the three variables above (no SDK dependency) | — |

## apps/admin (Vercel project `abonten-app-admin`, CI `build-admin`)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, **`ADMIN_EMAIL_ALLOWLIST`** (comma-separated emails; empty disables the gate — never leave empty in production), `NEXT_PUBLIC_ADMIN_URL`, `WEB_BASE_URL` (optional; web origin for Abonten Weekly preview links, default `https://abontenhub.com`), `NEXT_PUBLIC_SENTRY_DSN` (admin project), `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `OBSERVABILITY_INGEST_SECRET`, `PAYSTACK_SECRET_KEY` and `PAYMENTS_MODE` (for admin refund/payout actions via services — plus the matching `PAYSTACK_<CC>_SECRET_KEY` / `STRIPE_SECRET_KEY_<…>` of any other market being refunded; webhook secrets are not needed in the admin deployment), `GOOGLE_MAPS_API_KEY` (territory geocoding), `FIELD_OPS_KILL_SWITCH`, `REWARDS_KILL_SWITCH`, `SEARCH_V2_KILL_SWITCH`, `RECOMMENDATIONS_KILL_SWITCH` and `RECOMMENDATION_EMAIL_KILL_SWITCH` (display only in Admin › Discovery; the web deployment enforces them).

## apps/mobile (EAS environments development / preview / production; local `apps/mobile/.env` mirror)

`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL` (`https://abontenhub.com`), `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (restrict by Android package + SHA), `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_ENVIRONMENT`. **No secret may ever be set here** — all privileged operations go through `/api/mobile/**`. Native signing: keystore `*.jks` (gitignored), `google-services.json` (tracked client config).

## Database-side secrets

`observability_config` (health URL + secret), `notification_delivery_config` (dispatch URL + token). The `cleanupExpiredEvents` cron embeds the service-role JWT inline — **SEC-004**, to be moved to Vault.

## Test-only

`SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_ROLE_KEY` written to `.env.test.local` by `scripts/test-db/setup-local-test-db.mjs` (local Docker stack; gitignored).

## Rotation procedure

1. Generate the new secret at the provider (Supabase keys, Paystack, Cloudinary, Resend, Hubtel, Sentry token, Google).
2. Update Vercel env (web **and** admin where shared) and, for `EXPO_PUBLIC_*`, EAS env; update GitHub Actions secrets.
3. For `OBSERVABILITY_INGEST_SECRET`, also update the `observability_config` row; for the Supabase service-role key, also update the cron command (SEC-004) and any EAS/CI usage.
4. Redeploy web and admin; `eas update` if a public value changed (rare).
5. Revoke the old secret at the provider; confirm health probes green; check Sentry for auth errors.
6. Record the rotation date here.

| Secret | Last rotated |
|---|---|
| Supabase anon + service-role keys | 2026-09 (twice, during the limitation audit) |
| Others | NOT RECORDED — start the register (decision S3) |

## Leak response

`../incident-response/leaked-secret.md`.
