---
title: Continuous integration
purpose: The GitHub Actions workflows, what each job guards, and what it needs.
audience: Engineers
scope: .github/workflows/checks.yml, integration-tests.yml
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Continuous integration

Both workflows run on pushes to `main` and on pull requests.

## `checks.yml` — "Typecheck, lint & build"

| Job | Command | Secrets | Guards |
|---|---|---|---|
| `typecheck` | `npm run typecheck` | none | TypeScript across all 11 workspaces |
| `lint` | `npx biome check apps/web/src apps/admin/src apps/mobile/app apps/mobile/src packages` | none | Formatting and lint rules |
| `unit-tests` | `npx vitest run` (core), `npm run test -w @abonten/services`, `npm run check:api-parity` | none | Pure logic; mobile API ↔ client parity |
| `docs` | `npm run check:docs` | none | Documentation validation (required files, metadata, links, placeholders, social links, secret patterns, public/internal separation) |
| `build-web` | `npm run build -w @abonten/web` | Supabase, Cloudinary, Paystack, Hubtel, Resend, Google, Sentry, observability, site URLs | The web app builds with real config; static legal/help pages render |
| `build-admin` | `npm run build -w @abonten/admin` | Supabase, Sentry (admin DSN), `ADMIN_EMAIL_ALLOWLIST`, admin URL | The console builds |

Web and admin are separate jobs because they use different Sentry DSNs under the same env name.

## `integration-tests.yml` — "Integration tests"

Node 22, Supabase CLI pinned (2.116.0), `npm run test:db:up` → `npm run test:integration` → `npm run test:db:down` (always). Runs the 327-test suite against a from-scratch replay of `supabase/migrations/`.

## Secrets

Stored as GitHub Actions secrets; names in `../security/secrets-and-environment.md`. Rotating a secret means updating it here too.

## Local equivalents

Run the same commands before pushing: `npm run typecheck`, `npx biome check <touched paths>`, unit tests, `npm run check:api-parity`, `npm run check:docs`, and the integration suite when touching SQL, RLS or services.
