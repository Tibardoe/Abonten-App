---
title: Local setup
purpose: Get the monorepo running locally — web, admin and mobile — against the shared Supabase project or a local stack.
audience: Engineers
scope: Windows/macOS/Linux with Node 22, npm 11, Docker (for the integration DB), Android tooling for mobile
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Local setup

## Prerequisites

Node ≥ 20 (CI uses 22; the integration suite needs 22 for native WebSocket), npm 11 (`packageManager` pinned), Docker Desktop (integration tests), Supabase CLI 2.116.x (integration tests), Android Studio / an emulator or device (mobile), Expo CLI via `npx`.

## Install

```bash
git clone <repo> && cd Abonten-App
npm ci
```

Workspaces: `apps/*`, `packages/*`; Turborepo drives `build`, `typecheck`, `test`, `lint`, `dev`. Lefthook installs a pre-commit hook that runs Biome on staged files.

## Environment files (never commit)

- `apps/web/.env.local` — copy from `apps/web/.env.example`; needs Supabase URL/anon key, service-role key, Cloudinary, Paystack test keys, Hubtel, Resend, Google Maps, observability secret, Sentry (optional locally).
- `apps/admin/.env.local` — Supabase, service-role, `ADMIN_EMAIL_ALLOWLIST` (your Google email), admin Sentry DSN (optional).
- `apps/mobile/.env` — `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL` (point at your local web or a preview deployment), `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, Cloudinary cloud name.

Names and purposes: `../security/secrets-and-environment.md`. Values come from the founder / provider dashboards.

## Run

```bash
npm run web:dev        # apps/web on http://localhost:3000 (Turbopack)
npm run dev -w @abonten/admin   # apps/admin (default port per Next; set a different one if web is running)
cd apps/mobile && npx expo start   # run Expo from apps/mobile, not the repo root
```

Google sign-in locally needs the callback URL in the Supabase Auth allow list (`http://localhost:3000/auth/callback`, `abonten://auth/callback` for the app). Phone sign-in needs real Hubtel credentials (or test the flow through the integration suite where Hubtel is faked).

## Typecheck, lint, build

```bash
npm run typecheck                 # all workspaces (turbo)
npx biome check <paths>           # scope Biome to files you touched; never run the whole repo with --write
npm run build -w @abonten/web     # production build (needs the env vars)
npm run build -w @abonten/admin
```

## Database

Never run `supabase db push`. The schema is `supabase/migrations/`; production is updated by applying a migration via the Supabase MCP (`apply_migration`) and checking `get_advisors`. For a disposable local database: `npm run test:db:up` (writes `.env.test.local`), `npm run test:db:down`.

## Mobile builds

`eas build --profile preview --platform android` (APK) / `production`; `eas update --channel preview|production` for JS-only changes. Details: `../deployment/mobile-eas.md`.
