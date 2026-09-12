---
title: System overview
purpose: The technical shape of Abonten Hub — apps, packages, how requests flow, where logic lives, how it is deployed.
audience: Engineering, technical administrators
scope: The monorepo and its production topology as of 2026-09-12
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# System overview

## Topology

```mermaid
flowchart TB
  subgraph Clients
    WB[Browser → apps/web]
    MB[Android app → apps/mobile]
    AD[Staff browser → apps/admin]
  end
  subgraph Vercel cdg1
    WEB[apps/web: pages + Server Actions + /api/mobile + webhooks]
    ADM[apps/admin: console + Server Actions]
  end
  SVC[@abonten/services (in-process, server-only)]
  DB[(Supabase Postgres: RLS, RPCs, pg_cron)]
  ST[(Supabase Storage: private buckets)]
  CL[Cloudinary]
  PS[Paystack]  HB[Hubtel]  RS[Resend]  EX[Expo push]  GG[Google]  SN[Sentry]
  WB --> WEB
  MB -->|Bearer JWT| WEB
  MB -->|RLS reads| DB
  AD --> ADM
  WEB --> SVC --> DB
  ADM --> SVC
  SVC --> ST & CL & PS & HB & RS & EX & GG
  PS -->|webhook| WEB
  DB -->|cron → HTTP| WEB
  WEB & ADM & MB --> SN
```

- **`apps/web` is the backend.** It hosts the end-user site, ~283 Server Actions, the mobile HTTP API (`/api/mobile/**`, ~150 routes), the Paystack webhook, observability ingest, notification delivery, geocode and avatar upload routes.
- **`apps/admin`** is a separate Next 16 app for staff; it imports the same service package.
- **`apps/mobile`** never imports services; it uses the typed `@abonten/api-client` for class B/C operations and direct Supabase for class A reads.
- **`packages/services`** is the single source of business logic: `(supabase, userId, input) => { status, message?, data? }`, framework-free, server-only.
- **Supabase** holds data, auth, storage and the schedulers; privileged logic lives in `SECURITY DEFINER` RPCs.

## Repository structure

```
apps/web        Next 16 (App Router, Turbopack). src/app routes; src/actions (Server Actions); src/app/api (route handlers);
                src/components (atoms/molecules/organisms/ui); feature folders (events, places, wallet, messaging, rewards, fieldOps…);
                src/content (public legal + help Markdown); src/utils; src/config/supabase (client/server/middleware factories); src/proxy.ts
apps/admin      Next 16 console. src/app/(console)/*; src/lib/adminGuard.ts; src/server/actions.ts; src/components/Sidebar.tsx
apps/mobile     Expo SDK 57 / Expo Router. app/ (routes), src/features, src/components, src/lib
packages/services  business logic by domain (admin, checkout, events, fieldOps, messaging, notifications, organizer, payments, places,
                   platform, profile, promo-codes, promotions, reports, reviews, rewards, security, supabase, tickets, uploads) + __integration__ tests
packages/core      pure helpers (pricing, limits, eligibility, markdown, brand, rewards math, fieldOps logic, adminPermissions seed)
packages/types, validation (zod), api-client (typed mobile client), i18n (6 locales), ui-native, ui-tokens, config
supabase/migrations  204 SQL files (source of truth for schema); functions/delete-expired-events (edge fn); seed.sql
scripts/           check-mobile-api-parity.mjs, check-docs.mjs, test-db/*
docs/              internal documentation (this tree)
```

## Request paths

| Path | Identity | Authorization | Writes |
|---|---|---|---|
| Web page / Server Action | Supabase SSR cookie (`proxy.ts` refresh) | `auth.getUser()` in every action; RLS on the user's client; services prove ownership before service-role writes | service-role for privileged writes |
| `/api/mobile/**` | Bearer JWT → `getMobileAuth` → anon-key client with token | same services; RLS via `auth.uid()` | same |
| Mobile direct Supabase | native session | RLS only | class-A owner CRUD |
| Admin action | Google session + allowlist + `resolveAdminContext` + step-up | `assertPermission` per core | service-role, audited |
| Webhook / cron routes | provider signature / shared secret | route-level | service-role |

The "no logic fork" rule: a web action and its mobile route call the **same** service function; `npm run check:api-parity` guards that every mobile route has a client method.

## Data and money invariants

Server-side pricing; client cannot write money tables; idempotent postings; append-only ledgers; RLS everywhere; moderation filter in RPCs and RLS. Details: `../security/`, `../finance/`.

## Deployment

Vercel projects `abonten` (web → abontenhub.com) and `abonten-app-admin` (admin), region `cdg1` to sit next to the Supabase Paris project; EAS for mobile; migrations applied via the Supabase MCP. CI: typecheck, Biome, unit tests + API parity, web and admin builds, integration suite against a local Supabase replay, documentation validation. Details: `../deployment/`, `../development/ci.md`.

## Programmes that are built but not live

Abonten Rewards (shadow mode, visibility staff), the field programme (switched off), Paystack Transfers (flag off). Each has a kill switch and a documented switch-on sequence.
