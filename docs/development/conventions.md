---
title: Engineering conventions
purpose: The architecture rules and code conventions every change must follow, distilled from CLAUDE.md and the shared-backend design.
audience: Engineers (human and AI agents)
scope: Whole monorepo
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Engineering conventions

Authoritative long form: repository-root `CLAUDE.md` and `../architecture/shared-backend.md`.

## Architecture rules

1. **Business logic lives in `@abonten/services`** — `(supabase, userId, input) => { status, message?, data? }`, framework-free, server-only. Web Server Actions and `/api/mobile` routes are thin transports over the same function (no logic fork). `apps/mobile` never imports services.
2. **Server Actions**: one exported function per file in `apps/web/src/actions/`, `"use server"`, re-check `auth.getUser()`, return an envelope, never throw to the client.
3. **Supabase clients**: `config/supabase/client.ts` (browser), `server.ts` (RSC/actions), `middleware.ts` (proxy only), `publicClient.ts` (cookie-free static pages); services receive the client. Service-role only after ownership is proven.
4. **Money**: never price from client input; never write money tables with a client; every posting idempotent; ledgers append-only; the six `record_*` RPCs and all `credit_*`/`admin_*`/`fieldops_*` mutations are service-role only.
5. **Schema**: `supabase/migrations/` is the source of truth; forward-only; applied via MCP; advisors checked; never `db push`; RLS changes are deliberate decisions.
6. **Framework primitives** (`revalidatePath`, `after()`, `cookies()`, React email) stay in the transport and are passed into services as callbacks.
7. **Next 16**: `src/proxy.ts` is the middleware (do not rename back); keep the Cache Components TODO comments on route files.

## Code style

TypeScript `strict`; no `any` without a stated reason; Biome (double quotes, 2-space) enforced by Lefthook on staged files — scope manual runs to touched files; small atomic-design components (`atoms/molecules/organisms/ui`) in shared `src/components` and per-feature folders; react-hook-form + zod schemas in `packages/validation` / `src/utils/*Schema.ts`; Tailwind + shadcn tokens (`darkMode: "class"`); React Query where the surrounding code uses it.

## Mobile

Expo Router; class A vs B/C lane discipline; `@abonten/api-client` for every `/api/mobile` call (parity check); SecureStore for anything persisted; external links via `expo-web-browser` (`src/lib/legalLinks.ts` pattern); JS-only changes ship by EAS Update.

## Documentation

Behaviour, permission, job, table, integration or env-var changes update the affected doc in the same PR and add a changelog line; run `npm run check:docs`. Public content (`apps/web/src/content`) never contains internal detail. Unknown policy → `NOT DETERMINED FROM CODE — POLICY/PRODUCT DECISION REQUIRED` + register row.

## Git flow

Branch per chunk of work → commits with clear messages → push → `--no-ff` merge to `main` → push. Never commit `.env*`, keystores, Firebase admin keys, or generated build output. Commit messages from AI-assisted sessions carry the attribution trailer.

## Verification before claiming done

Run what applies and report exactly what ran: typecheck, scoped Biome, unit tests, integration suite (if SQL/services), `next build` (web/admin), `check:api-parity`, `check:docs`, browser or device checks where UI changed. Do not claim a suite passed unless it ran.
