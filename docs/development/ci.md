---
title: Continuous integration
purpose: The GitHub Actions workflows, what each job guards, and what it needs.
audience: Engineers
scope: .github/workflows/checks.yml, integration-tests.yml
status: Approved
version: 1.1
lastReviewed: 2026-09-27
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
| `typecheck` | `npm run typecheck` | none | TypeScript across all 11 workspaces. Web and admin run `next typegen && tsc --noEmit`: `next-env.d.ts` (image and CSS module types) and the route types are generated, gitignored files, so a bare `tsc` on a fresh checkout cannot resolve a static image import |
| `lint` | `npm run lint:ci` (`biome check apps/web/src apps/admin/src apps/mobile/app apps/mobile/src packages`) | none | Formatting and lint rules. The generated `packages/types/src/database.types.ts` is excluded in `biome.json`: it is replaced wholesale by the type generator, so it stays in the generator's style |
| `unit-tests` | `npx vitest run` (core), `npm run test -w @abonten/services`, `npm run check:api-parity`, `npm run check:mobile-a11y`, `npm run check:deep-link-decoder`, `npm run check:i18n` | none | Pure logic; mobile API ↔ client parity; every pressable view announces a role; the bundled deep-link decoder still matches the package it replaces and is still wired in; every locale has every English message key |
| `docs` | `npm run check:docs` | none | Documentation validation (required files, metadata, links, placeholders, social links, secret patterns, public/internal separation) |
| `build-and-e2e-web` | `npm run build -w @abonten/web`, then `npx playwright test` in `apps/web` against `next start` | Supabase, Cloudinary, Paystack, Hubtel, Resend, Google, Sentry, observability, site URLs | The web app builds with real config and the browser suite passes (headers, redirects, 404s, SEO tags, axe accessibility scan); the Playwright report is uploaded on failure |
| `build-admin` | `npm run build -w @abonten/admin` | Supabase, Sentry (admin DSN), `ADMIN_EMAIL_ALLOWLIST`, admin URL | The console builds |

Web and admin are separate jobs because they use different Sentry DSNs under the same env name.

## `integration-tests.yml` — "Integration tests"

Node 22, Supabase CLI pinned (2.116.0, installed by the Supabase `setup-cli@v3` action), `npm run test:db:up` → `npm run test:integration` → `npm run test:db:down` (always). Runs the 327-test suite against a from-scratch replay of `supabase/migrations/`.

## Secrets

Stored as GitHub Actions secrets; names in `../security/secrets-and-environment.md`. Rotating a secret means updating it here too.

Every job uses the Node 24 majors of the GitHub actions (`actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`); the v4 majors ran on the retired Node 20 action runtime. The jobs themselves run Node 22.

## Local equivalents

Run the same commands before pushing: `npm run typecheck`, `npm run lint:ci`, unit tests, `npm run check:api-parity`, `npm run check:i18n`, `npm run check:docs`, and the integration suite when touching SQL, RLS or services. Lefthook runs Biome on staged files at commit time (web, admin, mobile and package sources) and `npm run lint:ci` before every push, so a push cannot leave the lint job red.

A red `main` is not ambient noise: after pushing, check the run (`gh run list --workflow checks.yml --limit 3`). Between 2026-09-25 and 2026-09-27 the lint job failed on every push (the regenerated type file) and, from 2026-09-27, the typecheck job too (the first static image import), while both deploys kept succeeding, because Vercel builds do not wait for these checks.
