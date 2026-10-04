---
title: Testing
purpose: What automated tests exist, how to run them, what they cover, and what is not covered.
audience: Engineers
scope: Vitest unit tests, the Supabase integration suite, parity and documentation checks
status: Approved
version: 1.5
lastReviewed: 2026-10-04
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Testing

## Unit tests (Vitest)

- `packages/core`: 26 test files — pricing, limits, expiry, eligibility, ratings, messaging cache/reactions/realtime, video/highlight playback, email OTP helpers, markdown parser, field-ops lifecycle/territory/duplicate score/eligibility, rewards math/allocation/referral/invite/copy. Run: `cd packages/core && npx vitest run`.
- `packages/services`: 6 unit files — step-up token, payment method core, email auth core, promo code core, referral cookie, Cloudinary signature. Run: `npm run test -w @abonten/services` (unit only).

## Integration suite (real Postgres)

`packages/services/src/__integration__/` — 39 files / 327 tests as of 2026-09-12, against a **disposable local Supabase stack replayed from `supabase/migrations/`**:

```bash
npm run test:db:up          # Docker + Supabase CLI; writes .env.test.local
npm run test:integration
npm run test:db:down
```

Covers: authz and RLS (`authz`, `sec001-*`, `money-path-lockdown`, `promo-subscription-lockdown`, `review-response-authz`), checkout concurrency/idempotency/time guards, discovery filters, ratings, email auth, messaging (service, moderation, reactions, realtime), support admin, credits (ledger, authz, concurrency, admin ops, redemption, ticket redemption), rewards (event referral, friend referral, rebates, P8, notification delivery), field ops (rbac, lifecycle, assignments, onboarding, sweep, payouts, events/claims, content, analytics). Field ops fakes Hubtel via injected `sendOtp`/`verifyOtp` deps; phone sign-in (`hubtel-sms-sign-in`, `otp-send-*`) runs the real send path with Hubtel's SMS API stubbed at `fetch`; Paystack is not called.

The setup script copies migrations to a temp dir and neutralises a few documented statements that cannot replay by timestamp alone; production is never touched. A from-scratch replay is fingerprint-compared to production after schema work.

### Paystack sandbox (opt-in, real provider)

`paystack-sandbox.integration.test.ts` runs the Ghana money path against
Paystack's **test-mode** API with nothing mocked: a saved MTN test wallet
is charged, verified, the ticket issued, the fee and organizer earning
booked, the ticket price refunded through Paystack's refund API (fee
kept), and the signed `refund.processed` webhook delivered. It is skipped
unless `PAYSTACK_SANDBOX_SECRET_KEY` holds an `sk_test_` key — a live key
never enables it. Run it after a change to the charge, verify, fulfilment
or refund path:

```bash
PAYSTACK_SANDBOX_SECRET_KEY=<the test secret key> npx vitest run \
  --config vitest.integration.config.ts paystack-sandbox   # in packages/services
```

It leaves test-mode charges and refunds in the Paystack test dashboard;
the test webhook URL configured there receives them and ignores the
unknown references. It does not prove a live charge: a real card or
wallet in live mode is still the launch check.

## Browser suite (Playwright, web)

`apps/web/e2e/` runs against a production server (`next start`), so what is tested is what is deployed: the CSP and security headers, `/robots.txt` and `/sitemap.xml`, the sign-in redirect for private sections, the 404 page for unknown URLs and missing listings, the mobile API's 401 without a bearer token, the webhook's 401 without a signature, canonical URLs and titles, Open Graph and JSON-LD on a live event and place page (taken from the sitemap), and an axe-core accessibility scan of the public surface that fails on serious or critical violations. It checks the language a visitor gets (browser language, the preference cookie, no language in the address), that a page carries only the words it uses, the offline notice, and the navigation progress bar on a slow page. It also asserts route protection directly (`route-protection.spec.ts`: every private prefix redirects to sign-in, public paths do not, and `/api/geocode` answers 401 JSON) and that the Content-Security-Policy actually reports (`csp-reporting.spec.ts`: the configured `report-uri` is intercepted, a script from a disallowed origin is injected, and the browser's real `csp-report` is inspected; it skips where no Sentry DSN is configured, and also asserts the policy refuses nothing of the app's own).

Locally: `npm run build -w @abonten/web`, then `npx playwright test` in `apps/web` (first time: `npx playwright install chromium`; the app's `.env.local` must be present). The event and place checks skip when the database has no public listing; set `E2E_REQUIRE_CATALOGUE=1` to make that a failure. In CI it is the `build-and-e2e-web` job, which does what the integration suite does first — `npm run test:db:up` — then seeds one organizer, a published upcoming event and a published place (`scripts/test-db/seed-e2e.mjs`, refuses any non-local database), builds the web app against that stack and runs the suite with the catalogue required. To reproduce CI locally: `npm run test:db:up`, `node scripts/test-db/seed-e2e.mjs`, export `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` from the `SUPABASE_TEST_*` values in `.env.test.local`, build, and run with `E2E_REQUIRE_CATALOGUE=1`. The first such run (2026-09-27) found white text on the mint fill ("FEATURED" badge, 1.74:1) that the empty-catalogue runs had never rendered.

## Database grants

`packages/services/src/__integration__/function-grants.integration.test.ts` asserts both directions of every grant the application depends on: the RPCs called with the caller's own session must stay callable, and the service-role-only ones must stay refused. A grant is invisible to TypeScript and to review — the only thing that fails is a live call returning `42501` — and a migration that revoked three checkout sweeps broke production for about fifty minutes before an unrelated test happened to catch it. Add a row whenever an RPC starts being called with a session client, or is locked to the service role.

## Mobile accessibility

`npm run check:deep-link-decoder` guards the one dependency the mobile app carries a replacement for. `expo-router` reaches `decode-uri-component@0.2.2` through `query-string@7`; that package carries GHSA-vcc3-ghjq-m6fr and cannot be upgraded (the first patched release is ESM-only while query-string uses `require()`), so Metro resolves it to `apps/mobile/vendor/decode-uri-component.js` instead. The check differentially tests the replacement against the original over 3,033 inputs, proves it stays linear on the payload that defeats the original, confirms the Metro alias is still wired, and fails if expo-router stops supplying its own `getStateFromPath` — the fact that keeps the vulnerable path unused. It runs in CI. See `docs/audit/06-expo-dependency-migration-2026-09-19.md`.

`npm run check:mobile-a11y` fails if any `<Pressable>` with an `onPress` carries no `accessibilityRole`, so a pressable view always announces itself as a control to TalkBack and VoiceOver. It runs in CI. It is a static guard only: how a screen actually reads on a device is not covered (see below).

## Walking the app on a device

Some defects only exist on a phone: a screen that renders before its providers are mounted, a message the app's JavaScript engine cannot format, a translated word used as a lookup key. On 2026-10-02 the first run on a device after the strings moved into the catalogs found a crash on every cold start and every plural printing its key, with every check on a computer green.

`scripts/qa/mobile-walk.sh` opens about sixty screens by deep link on a connected Android device or emulator, saves what each one says, and fails when a screen shows a catalog key path or the developer error screen:

1. Open the app on the device (a development build on Metro, or a release build), sign in, and choose the language to check in Settings › Language.
2. Run `EVENT_ID=<uuid> PLACE_ID=<uuid> USERNAME=<handle> bash scripts/qa/mobile-walk.sh out/french`, naming an event, a place and a profile the signed-in account can open.
3. Read the saved `.txt` files for anything in the wrong language, for example `grep -nE "\b(the|and|your|with|not)\b" out/french/*.txt`.

Do this in at least one language other than English before a release that touches wording, the language provider or the app's start-up. It needs adb and python; it is not run in CI (there is no device there).

## Other checks

- `npm run check:api-parity` — every `/api/mobile/**` route has a typed client method.
- `npm run check:i18n` — the translation chain ([architecture/internationalisation.md](../architecture/internationalisation.md) §7).
- `npm run check:action-calls` — every Server Action called from browser code (website and admin console) has something to catch a dropped connection ([architecture/web-resilience.md](../architecture/web-resilience.md) §1).
- `npm run check:mobile-boot` — the app's splash and root error screen, which render without providers, use no provider hook.
- `npm run check:route-links` — every literal `href` / `push` / `replace` / `redirect` / `navigate` target in the website and the app matches a route folder (`apps/web/src/app`, `apps/mobile/app`).
- `npm run check:docs` — documentation validation (`documentation-validation.md`).
- `npm run typecheck`, Biome (`npx biome check <paths>`), `next build` for web and admin.

## Not covered (be honest in release notes)

- No signed-in web journeys in the browser suite yet (checkout, organizer management): the suite covers the public surface and the boundaries; signed-in flows are covered by the integration suite at the service layer.
- No admin UI tests.
- No device screen-reader testing. Roles and labels are enforced statically and by axe on web, but whether a screen *reads* sensibly through VoiceOver or TalkBack — focus order, grouping, gesture navigation — has not been checked on hardware.
- No mobile UI tests; device QA is manual on an Android emulator/device, helped by `scripts/qa/mobile-walk.sh` (above). Nothing in CI runs the app.
- The translations into French, Spanish, German and Portuguese are checked for completeness and form, not for quality: no native speaker has read them.
- No live Paystack tests in CI; the live money path was exercised manually (2026-09 audit).
- Regression tests for the self-authorizing SECURITY DEFINER functions are partial (SEC-001).
- Load testing: only the field-ops sweep (7,000 rows) was measured.

## Writing tests

Pure logic → `packages/core` with a Vitest file beside it. Anything touching RLS, RPCs or money → an integration test in `__integration__` using `setupClient.ts` (service-role and per-user clients). Keep tests independent of production data.
