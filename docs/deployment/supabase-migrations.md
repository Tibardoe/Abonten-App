---
title: Applying Supabase migrations
purpose: The safe procedure for schema changes — authoring, local replay, applying to production via MCP, verifying — and the rules that must never be broken.
audience: Engineers
scope: supabase/migrations, the live Supabase project, the integration replay
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Applying Supabase migrations

## Rules

1. **`supabase/migrations/` is the source of truth**; every schema, RLS, function, trigger and cron change is a new dated file. Never edit an applied file.
2. **Never `supabase db push`** against production — the repo and remote ledgers differ by design (files were renamed to true applied order; some historical statements are neutralised only in the disposable replay). A push would try to re-apply history.
3. Apply to production **via the Supabase MCP `apply_migration`** (records the version in the remote ledger) and immediately run `get_advisors` (security and performance). Then rename the local file to the version the ledger recorded if they differ.
4. Additive first: add columns/tables/functions before deploying code that uses them; drop only after no running code reads them.
5. RLS and grants are deliberate decisions; a new table gets policies (or an explicit deny-all) in the same migration.
6. `SECURITY DEFINER` functions pin `search_path = ''`, check `auth.uid()` or are granted to `service_role` only; revoke from `public/anon/authenticated` explicitly when service-only.
7. Cron jobs use `cron.schedule('<name>', …)` in the migration; secrets never inline (SEC-004 is the one legacy exception to fix).

## Procedure

1. Write the migration; run it locally: `npm run test:db:up` (replays everything from scratch), then the integration suite (`npm run test:integration`), adding tests for new RLS/functions.
2. Review with the checklist: policies present, grants correct, idempotency keys, CHECK constraints, indexes for FKs, comments explaining non-obvious constraints.
3. Apply to production via MCP; run advisors; note only the expected WARNs (authenticated-executable self-only helpers).
4. Fingerprint check when touching many objects: compare table/policy/function/column counts and digests between a fresh replay and production (last done 2026-09-12: 175/197/266/1854, identical).
5. Update `PROJECT.md` (§7 or the feature section), `docs/architecture/data-model-overview.md`, `roles-and-permissions.md` if RLS changed, `operations/scheduled-jobs.md` if cron changed, and the privacy inventory if personal data categories changed.
6. Commit the file with the code that depends on it.

## Rolling back

Forward-only: write a new migration that reverts the change. Data lost by a destructive change is recovered only from Supabase backups (`rollback-and-recovery.md`).

## Local stack notes

`scripts/test-db/setup-local-test-db.mjs` copies migrations to a temp directory, neutralises the documented irreducible statements, starts the stack with the Supabase CLI and writes `.env.test.local`. `supabase/seed.sql` seeds `user_status` (Active/Suspended/Banned) so sign-ups work locally.
