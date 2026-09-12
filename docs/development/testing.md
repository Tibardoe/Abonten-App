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

## Other checks

- `npm run check:api-parity` — every `/api/mobile/**` route has a typed client method.
- `npm run check:docs` — documentation validation (`documentation-validation.md`).
- `npm run typecheck`, Biome (`npx biome check <paths>`), `next build` for web and admin.

## Not covered (be honest in release notes)

- No web UI tests (Playwright is used ad hoc through the MCP for manual runs, not in CI).
- No mobile UI tests; device QA is manual on an Android emulator/device (the owner's checklist lives in memory notes and PROJECT.md).
- No live Paystack tests in CI; the live money path was exercised manually (2026-09 audit).
- Regression tests for the self-authorizing SECURITY DEFINER functions are partial (SEC-001).
- Load testing: only the field-ops sweep (7,000 rows) was measured.

## Writing tests

Pure logic → `packages/core` with a Vitest file beside it. Anything touching RLS, RPCs or money → an integration test in `__integration__` using `setupClient.ts` (service-role and per-user clients). Keep tests independent of production data.
