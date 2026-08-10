# CLAUDE.md — Instructions for Working on Abonten Hub

This file tells Claude how to work in this repository. It combines general engineering discipline with facts specifically verified about this codebase. For the full architecture writeup (routes, database schema, features, known issues), see [PROJECT.md](PROJECT.md) — read it before large tasks, and keep it in sync with any significant change (see "Documentation" below).

---

## 0. Quick Facts About This Repo (verified — see PROJECT.md for detail)

- **Stack**: Next.js 16.3.0 (App Router, Turbopack dev), React 19, TypeScript (`strict: true`), Tailwind CSS 3 + shadcn/ui ("new-york" style) + Radix, TanStack Query 5, react-hook-form + Zod, Supabase (`@supabase/ssr`), Cloudinary, Biome (primary linter/formatter), Lefthook (pre-commit hook runs Biome).
- **No test suite exists** in this repo (no Jest/Vitest/Playwright in `package.json`). Don't claim "tests pass" — there are none to run.
- **Backend pattern**: almost all data reads/writes go through Server Actions in `src/actions/` (`"use server"` files, ~50 of them). There is no general REST/GraphQL API layer — only 3 route handlers exist under `src/app/api/` for special cases (geocoding, avatar upload, one profile lookup).
- **Database**: Supabase Postgres. The actual schema lives in `supabase/migrations/20260810084821_remote_schema.sql` (pulled from the live project) — this is the source of truth, not application code's assumptions about table/column names. PROJECT.md §7 documents it in full, including confirmed discrepancies between the app and the real schema (e.g. a hook reading columns that don't exist, an API route querying a non-existent table, no payment-gateway code despite the DB expecting Flutterwave). **Don't silently "fix" these as a side effect of unrelated work — flag them and ask.**
- **Auth**: Supabase Auth. Google OAuth is the working sign-in path. Phone/OTP sign-in is half-wired (Hubtel OTP send/verify happens, but the Supabase session-creation calls are commented out) — treat it as incomplete, not broken-by-accident.
- **Route protection**: `src/proxy.ts` (Next.js 16's renamed `middleware.ts`) plus per-action `auth.getUser()` checks. Don't rename this file back to `middleware.ts` — the rename is the correct Next.js 16 convention, confirmed via this project's own upgrade commit.
- **i18n**: `next-intl` is fully scaffolded (`src/i18n/`, `messages/en.json`) but currently disabled (middleware and layout locale handling are commented out, no `useTranslations` calls exist anywhere). Don't assume it's active.

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
- Do not modify Supabase migrations, RLS policies, database functions, or triggers unless explicitly instructed. Note: as pulled, this schema currently shows **no RLS policies** on any table — don't assume RLS is protecting data at the database level; the app relies on Server Actions checking `auth.getUser()` instead. Don't "fix" this unprompted — it needs a deliberate, confirmed decision.
- Some tables in the pulled schema (`event_media`, `payment_method`, `wallet`, `story`, `event_share`, `media_audit`) show zero partitions, and `review`'s partitions only cover mid-2025 — meaning inserts into them may currently fail. Don't assume this is safe to route around in application code without flagging it; it's a database-level issue.

---

## 3. Before Making Changes

- Before making significant changes, read the relevant existing code first — don't guess at how something works from a filename.
- Explain the implementation plan before making significant, architectural, database-related, security-sensitive, or potentially breaking changes. For simple, low-risk changes (e.g. fixing an obvious typo, adjusting a class name), proceed without asking.
- For breaking, destructive, or architectural changes, explain the consequences and get confirmation before proceeding.
- When multiple reasonable approaches exist, briefly explain the options and recommend one rather than picking silently.
- When fixing an error, find the likely root cause before changing anything — prefer fixing the underlying cause over hiding the symptom (e.g. don't wrap a failing query in a try/catch that swallows the error without understanding why it fails).

---

## 4. Code Quality — Existing Conventions to Match

- **Server Actions** (`src/actions/*.ts`, `"use server"`): one exported function per file, named after the file. Every action independently re-checks `supabase.auth.getUser()` even though `proxy.ts` also gates routes. Actions return a plain object — `{ status: number, message?: string, data?: ... }` — rather than throwing; callers check `status`. Match this convention for new actions instead of throwing errors.
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
