---
title: Testing
purpose: What automated tests exist, how to run them, what they cover, and what is not covered.
audience: Engineers
scope: Vitest unit tests, the Supabase integration suite, parity and documentation checks
status: Approved
version: 1.0
lastReviewed: 2026-09-12
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

Covers: authz and RLS (`authz`, `sec001-*`, `money-path-lockdown`, `promo-subscription-lockdown`, `review-response-authz`), checkout concurrency/idempotency/time guards, discovery filters, ratings, email auth, messaging (service, moderation, reactions, realtime), support admin, credits (ledger, authz, concurrency, admin ops, redemption, ticket redemption), rewards (event referral, friend referral, rebates, P8, notification delivery), field ops (rbac, lifecycle, assignments, onboarding, sweep, payouts, events/claims, content, analytics). Hubtel is faked via injected `sendOtp`/`verifyOtp` deps; Paystack is not called.

The setup script copies migrations to a temp dir and neutralises a few documented statements that cannot replay by timestamp alone; production is never touched. A from-scratch replay is fingerprint-compared to production after schema work.

## Browser suite (Playwright, web)

`apps/web/e2e/` runs against a production server (`next start`), so what is tested is what is deployed: the CSP and security headers, `/robots.txt` and `/sitemap.xml`, the sign-in redirect for private sections, the 404 page for unknown URLs and missing listings, the mobile API's 401 without a bearer token, the webhook's 401 without a signature, canonical URLs and titles, Open Graph and JSON-LD on a live event and place page (taken from the sitemap), and an axe-core accessibility scan of the public surface that fails on serious or critical violations. It also asserts route protection directly (`route-protection.spec.ts`: every private prefix redirects to sign-in, public paths do not, and `/api/geocode` answers 401 JSON) and that the Content-Security-Policy actually reports (`csp-reporting.spec.ts`: the configured `report-uri` is intercepted, a script from a disallowed origin is injected, and the browser's real `csp-report` is inspected; it skips where no Sentry DSN is configured, and also asserts the policy refuses nothing of the app's own).

Locally: `npm run build -w @abonten/web`, then `npx playwright test` in `apps/web` (first time: `npx playwright install chromium`; the app's `.env.local` must be present). In CI it is the `build-and-e2e-web` job.

## Database grants

`packages/services/src/__integration__/function-grants.integration.test.ts` asserts both directions of every grant the application depends on: the RPCs called with the caller's own session must stay callable, and the service-role-only ones must stay refused. A grant is invisible to TypeScript and to review — the only thing that fails is a live call returning `42501` — and a migration that revoked three checkout sweeps broke production for about fifty minutes before an unrelated test happened to catch it. Add a row whenever an RPC starts being called with a session client, or is locked to the service role.

## Mobile accessibility

`npm run check:deep-link-decoder` guards the one dependency the mobile app carries a replacement for. `expo-router` reaches `decode-uri-component@0.2.2` through `query-string@7`; that package carries GHSA-vcc3-ghjq-m6fr and cannot be upgraded (the first patched release is ESM-only while query-string uses `require()`), so Metro resolves it to `apps/mobile/vendor/decode-uri-component.js` instead. The check differentially tests the replacement against the original over 3,033 inputs, proves it stays linear on the payload that defeats the original, confirms the Metro alias is still wired, and fails if expo-router stops supplying its own `getStateFromPath` — the fact that keeps the vulnerable path unused. It runs in CI. See `docs/audit/06-expo-dependency-migration-2026-09-19.md`.

`npm run check:mobile-a11y` fails if any `<Pressable>` with an `onPress` carries no `accessibilityRole`, so a pressable view always announces itself as a control to TalkBack and VoiceOver. It runs in CI. It is a static guard only: how a screen actually reads on a device is not covered (see below).

## Other checks

- `npm run check:api-parity` — every `/api/mobile/**` route has a typed client method.
- `npm run check:docs` — documentation validation (`documentation-validation.md`).
- `npm run typecheck`, Biome (`npx biome check <paths>`), `next build` for web and admin.

## Not covered (be honest in release notes)

- No signed-in web journeys in the browser suite yet (checkout, organizer management): the suite covers the public surface and the boundaries; signed-in flows are covered by the integration suite at the service layer.
- No admin UI tests.
- No device screen-reader testing. Roles and labels are enforced statically and by axe on web, but whether a screen *reads* sensibly through VoiceOver or TalkBack — focus order, grouping, gesture navigation — has not been checked on hardware.
- No mobile UI tests; device QA is manual on an Android emulator/device (the owner's checklist lives in memory notes and PROJECT.md).
- No live Paystack tests in CI; the live money path was exercised manually (2026-09 audit).
- Regression tests for the self-authorizing SECURITY DEFINER functions are partial (SEC-001).
- Load testing: only the field-ops sweep (7,000 rows) was measured.

## Writing tests

Pure logic → `packages/core` with a Vitest file beside it. Anything touching RLS, RPCs or money → an integration test in `__integration__` using `setupClient.ts` (service-role and per-user clients). Keep tests independent of production data.
