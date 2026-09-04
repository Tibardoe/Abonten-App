# CLAUDE.md — Instructions for Working on Abonten Hub

This file tells Claude how to work in this repository. It combines general engineering discipline with facts specifically verified about this codebase. For the full architecture writeup (routes, database schema, features, known issues), see [PROJECT.md](PROJECT.md) — read it before large tasks, and keep it in sync with any significant change (see "Documentation" below).

---

## 0. Quick Facts About This Repo (verified — see PROJECT.md for detail)

- **Stack**: Next.js 16.3.0 (App Router, Turbopack dev), React 19, TypeScript (`strict: true`), Tailwind CSS 3 + shadcn/ui ("new-york" style) + Radix, TanStack Query 5, react-hook-form + Zod, Supabase (`@supabase/ssr`), Cloudinary, Biome (primary linter/formatter), Lefthook (pre-commit hook runs Biome).
- **No test suite exists** in this repo (no Jest/Vitest/Playwright in `package.json`). Don't claim "tests pass" — there are none to run.
- **Backend pattern**: business logic lives in the framework-free **`@abonten/services`** package (`packages/services/src/<domain>/`) — the single source of truth, `(supabase, userId, input) => { status, message?, data? }`. Two thin transports consume it: web **Server Actions** (`apps/web/src/actions/**`, `"use server"`, cookie session — ~200 of them) and the **mobile HTTP API** (`apps/web/src/app/api/mobile/**` route handlers, Bearer JWT via `getMobileAuth`, typed by `@abonten/api-client`). `apps/mobile` never imports `@abonten/services` — it only calls the HTTP API, plus direct `supabase.*` for RLS-safe "class-A" reads/CRUD (see `docs/architecture/shared-backend.md` for the A/B/C classification and diagrams). Framework primitives (`revalidatePath`, `after()`, React email) stay in the transport and are passed into services as callbacks/deps. Route handlers under `src/app/api/` that are NOT `/api/mobile`: geocoding, avatar upload, one profile lookup, the Paystack webhook.
- **Database**: Supabase Postgres. The actual schema lives in `supabase/migrations/20260810084821_remote_schema.sql` (pulled from the live project) — this is the source of truth, not application code's assumptions about table/column names, and not the baseline file alone either: several confirmed discrepancies from that pulled snapshot were later fixed by dated migrations (see below and PROJECT.md §7 for the full, currently-accurate list). **Don't silently "fix" a remaining discrepancy as a side effect of unrelated work — flag it and ask.**
- **Payments**: Paystack is fully implemented end-to-end (`packages/services/src/payments/gateway/paystackService.ts` — moved there from `src/services/` on the shared-backend branch; popup + direct-charge + mobile-money OTP + webhook at `src/app/api/paystack/webhook/route.ts` + client-side verification racing safely against that webhook via the same `@abonten/services/payments/finalizePaystackPayment` both call — the three fulfilment actions `generateTicket` / `activate{Event,Place}Promotion` stay in `apps/web` and are injected into it as `paymentFulfillmentDeps`). No Flutterwave code exists anywhere in `src/`. An earlier revision of this file said "no payment-gateway code despite the DB expecting Flutterwave" — that's out of date as of 2026-08-16 (`supabase/migrations/20260816150312_add_wallet_and_payment_attempt.sql` added the `payment_attempt` table Paystack attempts are recorded against); verify against source before trusting either state.
- **Ticket fee model** (2026-08-30, see PROJECT.md §22): the customer pays the Abonten service fee **on top** of the ticket price; the organizer receives **100%** of the ticket price they set (recorded as a pending earning, settled 48h after the event). The fee rate is centrally configured in the `platform_fee_config` table (seeded 5%) — `get_active_platform_fee_rate()` / `@abonten/services/platform/platformFee` / `useServiceFeeRate.ts`; do not hard-code it. Abonten fee revenue + processing cost are recorded in `platform_fee_entry` (RLS: no policy). The six `record_*` ledger/fee RPCs are **`SECURITY DEFINER`, `EXECUTE` for `service_role` only** (revoked from `authenticated` 2026-09-02, migration `20260903200000`) — call them from the service-role client only (`finalizePaystackPayment`, `generateTicket`, `issueRefundCore`, the webhook), never as the buyer/organizer's session. Refunds retain the fee: `issueRefundCore` requests a **partial** Paystack refund of the ticket revenue only (`get_transaction_refundable_amount`). `record_organizer_earning()` no longer deducts a fee — pre-2026-08-30 `organizer_ledger_entry` `earning` rows keep their historical 2% split (forward-only).
- **Auth**: Supabase Auth. Google OAuth is the working sign-in path. Phone/OTP sign-in is half-wired (Hubtel OTP send/verify happens, but the Supabase session-creation calls are commented out) — treat it as incomplete, not broken-by-accident.
- **Route protection**: `src/proxy.ts` (Next.js 16's renamed `middleware.ts`) plus per-action `auth.getUser()` checks. Don't rename this file back to `middleware.ts` — the rename is the correct Next.js 16 convention, confirmed via this project's own upgrade commit.
- **i18n**: `next-intl` is active — `NextIntlClientProvider` is wired into `src/app/layout.tsx`, and `useTranslations`/`getTranslations` are called from several components (`Header.tsx`, `Landing.tsx`, `AuthModal.tsx`, `SideBar.tsx`, `MobileNavBar.tsx`, `DeletePopupModal.tsx`, `useEventUploadForm.ts`, `Language.tsx`, `SwitchAppearance.tsx`, `GoogleAuthButton.tsx`, `eventSchema.ts`). Earlier revisions of this file described it as disabled — that's out of date as of 2026-08-15; verify against source before trusting either state.
- **Admin Console** (2026-09-04, see PROJECT.md §23): a **third app**, `apps/admin` (`@abonten/admin`) — a separate protected Next 16 operations console, another client of `@abonten/services` (never forks logic). RBAC via `admin_role`/`admin_permission`/`admin_role_permission`/`admin_user`/`admin_user_role` — the **`admin_role_permission` table is the live matrix** (`resolveAdminContext` reads it; runtime-editable in Admin › Settings, super_admin locked by a DB trigger; `@abonten/core/adminPermissions` is now seed + typed key lists + fallback only — PROJECT.md §23.12); auth = Supabase OAuth + `ADMIN_EMAIL_ALLOWLIST` + `resolveAdminContext()` re-check every request + step-up re-auth for ban/finance/settings. `admin_audit_log` is append-only (trigger-enforced). **Generic `report` table** (polymorphic, replaces the dropped `place_report`) fed by `@abonten/services/reports/submitReportCore` from web `submitReport` action + `POST /api/mobile/reports`. **Moderation**: additive `moderation_state` column on event/place/highlight/review tables + `apply_moderation_action` RPC; the 7 PostGIS discovery RPCs now exclude `hidden`/`removed`. **Observability is hybrid & real**: the self-hosted pipeline is primary — `app_error_event`/`app_error_group` via `@abonten/core/reportError` → `/api/observability/error`; `health_check_result` via real probes at `/api/observability/health` run by a `pg_cron` job reading `observability_config`. **Sentry** (`@sentry/nextjs` v10) is layered into **`apps/web` only** as of 2026-09-04 (PROJECT.md §23.10): manual App-Router setup (`src/instrumentation*.ts` + `sentry.{server,edge}.config.ts` + `withSentryConfig`), `enabled` only in a production build, preview/prod separated by the `environment` tag; `/api/observability/error` also-sends `web`/`api` events to Sentry. `SENTRY_AUTH_TOKEN` is server/CI-only. Mobile + admin get their own Sentry projects later. Admin service layer: `packages/services/src/admin/**` — every fn takes a service-role client + a pre-resolved `AdminContext` and re-checks its permission. Modules: Dashboard, Reports & Moderation, Users, Audit Logs, Monitoring, Admin Settings (Phase 1); Claims (reuses `approve_place_claim`), Content-moderation browse, Events/Places/Organizers read views (Phase 2, §23.8b); **read-only Finance ops centre** (Overview / Transactions+full-trace / Refunds / Payouts / per-organizer — §23.8c, Phase 3); **error-group detail + incident workflow + Platform Analytics** (§23.8d, Phase 4); **global search + bulk "resolve all N" report-group resolution** (§23.8e, Phase 5). Phases 2–5 are code-only (no migration). Every planned nav entry is live. Non-RPC read-path moderation filtering is enforced at the RLS layer (migration `20260907091500`, §23.5). Still deferred: admin-initiated refunds/payouts, Notification ops — see PROJECT.md §23.9. (DONE: Sentry `also-send` adapter §23.10; mobile request-timing metrics into `app_request_metric` §23.11 — web/API request perf is Sentry's job now; runtime-editable role matrix §23.12.)

---

## 1. Development Rules

- Use TypeScript throughout. The project already runs `strict: true` — don't weaken `tsconfig.json` to make something compile.
- Follow the existing architecture and patterns unless there's a good reason to change them (see "Code Quality" for what those patterns are).
- Follow Next.js App Router best practices and current Next.js 16 conventions — this project is mid-migration (see the Cache Components TODOs left on most route files, and `proxy.ts` replacing `middleware.ts`). When touching a route file, check whether it already has one of these upgrade TODO comments and don't remove it as an unrelated cleanup.
- **Before adding a new component, hook, utility, service, or Server Action, check whether one already exists.** This repo already has ~50 Server Actions in `src/actions/`, a large shared component library in `src/components/{atoms,molecules,organisms,ui}`, plus feature-specific atomic-design folders (`src/events`, `src/wallet`, `src/settings`, `src/userAccount`, `src/landing Page`), hooks in `src/hooks/`, and services in `src/services/`. Search these before writing new ones.
- Keep components focused, readable, and maintainable — this codebase favors many small `atoms`/`molecules`/`organisms` files over large multi-purpose components; follow that granularity.
- Avoid `any` unless there's a justified reason (and say what it is).
- Do not unnecessarily rewrite working code. Keep changes scoped to the requested task. Do not modify unrelated files. Do not delete or rename files unless the task requires it.

---

## 2. Safety and Sensitive Changes

- Do not change database schema, authentication behavior, environment variables, dependencies, or project configuration without explaining the impact first.
- **Never expose, commit, or invent secrets or environment-variable values.** `.env.local` in this repo already contains real third-party keys (Supabase, Cloudinary, Twilio, Resend, Google, Hubtel) — it's correctly gitignored; keep it that way, never print its contents into a file that could be committed, and never fabricate placeholder-looking values that could be mistaken for real ones.
- Never modify `.env` or `.env.local` unless explicitly instructed.
- Never hard-code credentials, API keys, tokens, or passwords anywhere in source.
- **Treat the actual Supabase schema (`supabase/migrations/20260810084821_remote_schema.sql`) as the source of truth for database structure** — not assumptions from query strings in `src/actions/`, and not what an older doc might say. If application code and the real schema disagree, that's a discrepancy to flag (PROJECT.md §7.6 has known ones), not something to silently paper over.
- Do not modify Supabase migrations, RLS policies, database functions, or triggers unless explicitly instructed. Note: the schema as originally pulled (2026-08-10) showed **no RLS policies** on any table, but RLS was subsequently enabled on most tables via seven migrations dated 2026-08-25 (see PROJECT.md §7.1's RLS note) — access control today is RLS **and** Server Actions checking `auth.getUser()` together, not app-layer-only. Re-verify against the actual migrations before assuming either RLS state; don't add or change policies unprompted — that still needs a deliberate, confirmed decision.
- Some tables in the *originally pulled* schema (`event_media`, `payment_method`, `wallet`, `story`, `event_share`, `media_audit`) showed zero partitions, and `review`'s partitions only covered mid-2025 — meaning inserts into them could fail. **`payment_method` was subsequently fixed**: `supabase/migrations/20260816150312_add_wallet_and_payment_attempt.sql` (2026-08-16) added 4 real partitions (`payment_method_p0`..`p3`) — inserts work fine today, confirmed against `addPaymentMethod.ts`. **`wallet` (the stored-value balance table) is still unpartitioned** as of the most recent migration touching it (`20260825110112_enable_rls_wallet.sql`'s own comment confirms "Currently has 0 partitions") — and separately, no application code anywhere reads or writes that table at all (the app's "wallet" feature in `src/wallet/` is saved payment methods, backed by `payment_method`, not this table — a naming collision, not the same thing). Re-verify the other listed tables' partition state against the actual migrations before assuming either way; don't route around any of this in application code without flagging it — it's a database-level issue.

---

## 3. Before Making Changes

- Before making significant changes, read the relevant existing code first — don't guess at how something works from a filename.
- Explain the implementation plan before making significant, architectural, database-related, security-sensitive, or potentially breaking changes. For simple, low-risk changes (e.g. fixing an obvious typo, adjusting a class name), proceed without asking.
- For breaking, destructive, or architectural changes, explain the consequences and get confirmation before proceeding.
- When multiple reasonable approaches exist, briefly explain the options and recommend one rather than picking silently.
- When fixing an error, find the likely root cause before changing anything — prefer fixing the underlying cause over hiding the symptom (e.g. don't wrap a failing query in a try/catch that swallows the error without understanding why it fails).

---

## 4. Code Quality — Existing Conventions to Match

- **Server Actions** (`src/actions/*.ts`, `"use server"`): one exported function per file, named after the file. Every action independently re-checks `supabase.auth.getUser()` even though `proxy.ts` also gates routes. Actions return a plain object — `{ status: number, message?: string, data?: ... }` — rather than throwing; callers check `status`. Match this convention for new actions instead of throwing errors. **A Server Action that does more than a trivial RLS-scoped read should be a thin wrapper: resolve identity → validate → call an `@abonten/services` function → return its envelope. Put the actual logic in `@abonten/services` so the matching `/api/mobile` route can share it verbatim (the "no logic fork" rule).**
- **Supabase clients**: use the right factory for the context — `src/config/supabase/client.ts` (browser/client components), `src/config/supabase/server.ts` (Server Components/Server Actions, via `next/headers` cookies), `src/config/supabase/middleware.ts` (only used by `proxy.ts`). Don't create new ad hoc Supabase client instances.
- **Forms**: `react-hook-form` + `@hookform/resolvers/zod` + a `zod` schema, typically defined in `src/utils/*Schema.ts` (see `eventSchema.ts`, `receivingAcountSchema.ts` for the style — explicit user-facing messages per rule). Use the shared `src/components/ui/form.tsx` primitives.
- **Styling**: Tailwind CSS with the shadcn CSS-variable theme in `src/app/globals.css` / `tailwind.config.ts` (`darkMode: "class"`, HSL tokens for `background`/`primary`/etc., plus custom `mint`/`iconGray` brand colors). Use existing shadcn primitives in `src/components/ui/` and `class-variance-authority`/`tailwind-merge` patterns already in use rather than introducing a new styling approach.
- **Component organization**: atomic design (`atoms` → `molecules` → `organisms` → `templates`), both in `src/components/` (shared) and duplicated per-feature (`src/wallet/`, `src/settings/`, `src/userAccount/`, `src/events/`). Put new UI in the layer and folder matching its scope and reuse — don't invent a new organizational scheme.
- **State/data fetching**: React Query is provided globally (`src/providers/ReactQueryProvider.tsx`) but adoption is partial — most fetching still goes through direct Server Action calls in `useEffect`/handlers. Follow whatever pattern the surrounding code in the file you're editing already uses; don't mix conventions within one component without reason.
- **Formatting**: Biome is the enforced formatter/linter (double quotes, 2-space indent — see `biome.json`), run automatically on staged files via Lefthook pre-commit. Don't fight its formatting choices by hand.
- Prefer simple, maintainable solutions over complex ones. Don't introduce a new library when something already in `package.json` solves the problem. Avoid unnecessary abstraction — this codebase already favors many small, concrete files over generic/configurable ones; match that.
- Preserve existing functionality unless the task requires changing it.
- Add comments only for genuinely non-obvious logic — hidden constraints, business rules, workarounds (e.g. the kind of thing found in `proxy.ts`'s cookie-handling comments). Don't comment obvious code.

---

## 5. Verification

Run what's appropriate for the change, using the scripts that actually exist in this repo:

- **Lint/format**: `npm run lint` (Biome — the primary linter, auto-fixes `src/`) and/or `npm run lint:next` (ESLint via `next lint`, secondary).
- **Type check**: no dedicated script exists; use `npx tsc --noEmit`.
- **Build**: `npm run build` (Next.js production build — the most reliable overall correctness check given there's no test suite).
- **No automated tests exist in this repo.** Don't claim "tests pass" or invent a test command — say plainly that no test suite exists if verification-by-testing is expected.
- Don't claim something works unless you actually ran a command and checked its output. If you can't verify (e.g. a UI change needs a running browser you don't have), say so explicitly and describe what's unverified.
- Read warnings, not just exit codes — a zero exit code from `next build` can still print meaningful warnings.

---

## 6. Documentation

- Keep [PROJECT.md](PROJECT.md) synchronized with significant architectural changes (new major feature, new external service, schema changes, route restructuring, etc.). Small/local changes don't need a doc update.
- Don't write documentation based on assumptions — verify against the actual code or schema first, the same way PROJECT.md's database section was rewritten from the real pulled schema instead of guesses from query strings.
- When documentation and source code (or the database) disagree, investigate the source/schema and call out the discrepancy explicitly rather than silently trusting either one.

---

## 7. Communication

- Use simple English. Avoid unnecessary jargon; briefly explain any technical term that matters (e.g. "RLS — a Postgres feature that restricts which rows a user can read/write directly").
- Don't hide technical detail — explain what's happening and why, so the reasoning is followable even for non-experts.
- When reporting an error, cover: (1) what went wrong, (2) why it happened, (3) what needs to change, (4) how the fix was verified.

---

## 8. Completion Summary

After finishing a task, summarize:

- What changed.
- Which files were modified.
- Why the changes were made.
- What verification was performed (and what, if anything, couldn't be verified).
- Any remaining warnings, risks, or open issues — including if the task surfaced one of the known discrepancies in PROJECT.md §7.6/§16 that wasn't fixed because it was out of scope.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
