---
title: Web and admin on Vercel
purpose: How apps/web and apps/admin are built and deployed on Vercel, and the settings that matter.
audience: Engineers
scope: Vercel projects abonten and abonten-app-admin
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Web and admin on Vercel

| | `abonten` (web) | `abonten-app-admin` (admin) |
|---|---|---|
| Source | `apps/web` on `main` | `apps/admin` on `main` |
| Domains | abontenhub.com (+ vercel.app aliases) | admin.abontenhub.com |
| Region | `cdg1` (Paris) — `apps/web/vercel.json` | `cdg1` — `apps/admin/vercel.json` |
| Framework | Next 16.3, Turbopack build; `output: standalone` only when not on Vercel | same |
| Sentry | project `abonten-web`, source maps uploaded when `SENTRY_AUTH_TOKEN` present, deleted after upload | project `abonten-admin` |
| Indexing | normal | `X-Robots-Tag: noindex, nofollow` on every path |

## Build

`next build` per app (CI jobs `build-web`, `build-admin`). Workspace packages ship as raw TypeScript and are compiled by Next via `transpilePackages` (`@abonten/core`, `types`, `validation`, `i18n`, `ui-tokens`; admin also `@abonten/services`). The legal and help pages read Markdown from `apps/web/src/content` at build time and prerender (`○`/`●` in the build output) — the content must live inside the app so it is always in the build context.

## Environment

Set per project in Vercel (Production and Preview). Names: `../security/secrets-and-environment.md`. `NEXT_PUBLIC_*` values are public; everything else server-only. Preview deployments should use Paystack **test** keys.

## Redirects and headers

`apps/web/next.config.ts`: `/terms → /legal/terms`, `/privacy → /legal/privacy`, `/cookies → /legal/cookies` (permanent); legacy `/manage/attendance/*` → `/manage/events*`; `Content-Type: application/json` for `/.well-known/apple-app-site-association`. Images allowed from `lh3.googleusercontent.com` and `res.cloudinary.com`.

## Middleware

`apps/web/src/proxy.ts` (Next 16's middleware) refreshes the Supabase session and gates protected routes; matcher excludes static assets, `/api/mobile`, `/api/observability`, `/api/notifications`, `/api/paystack/webhook`. Public paths are listed in `config/supabase/middleware.ts`.

## After a deploy

Admin › Monitoring health (`self` must be green — the cron reaches the new deployment); Sentry release; the release checklist. If a domain or URL changes, update `observability_config` and `notification_delivery_config` rows, Supabase Auth redirect URLs, Paystack webhook URL, and `EXPO_PUBLIC_API_BASE_URL`.

## Docker

A multi-stage `apps/web/Dockerfile` and compose files exist but are commented out / not the deployment path; Vercel is.
