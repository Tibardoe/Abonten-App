---
title: Database security
purpose: Document the Postgres/Supabase security model — RLS coverage, service-role boundaries, privileged functions, immutability triggers, column guards, and migration discipline.
audience: Engineering, security reviewers
scope: supabase/migrations, Supabase project configuration
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Database security

## Row-level security

RLS is enabled on every `public` table (fingerprint 2026-09-12: 175 tables, 175 with RLS, 197 policies — identical between a from-scratch replay and production). Patterns:

- **Owner-scoped** (`user_id = auth.uid()`), **organizer-scoped** (`EXISTS event.organizer_id = auth.uid()`), **owner-of-place**, **participant** (messaging via `is_conversation_participant`), **staff** (`is_staff()`).
- **Public branches** require `status = 'published'/'approved'` **and** `moderation_state IS DISTINCT FROM 'hidden'/'removed'` (migrations `20260903234655`, `20260907091500`).
- **Service-role-only tables** carry an explicit `service_role_only … USING (false)` deny-all policy for legibility (LOW-009): admin tables, audit log, observability, rate limits, OTP state, platform fees, report events, moderation actions, field settings/rules/batches/job runs.
- Partition leaves inherit the parent's policies; direct partition access has none.

Summary map by table: `../architecture/roles-and-permissions.md` §RLS.

## Grants vs policies

Money-path tables (`transaction`, `payment_attempt`, `ticket_checkout`, promotion checkouts and promotions, `promo_code_usage`, `subscription*`) had their client write **policies dropped and grants revoked** (`20260910230109`, `20260911005153`). Credit ledger tables grant only SELECT even to `service_role`. `notification_preference` revokes everything from clients. Field tables grant clients SELECT only.

## SECURITY DEFINER functions

~200 definer functions, `search_path = ''` pinned. Two classes:

1. **Self-authorizing helpers executable by `authenticated`** — e.g. `is_staff`, `admin_has_permission`, `fieldops_is_member`, `get_my_credit_summary`, discovery RPCs, `request_organizer_payout` (checks `auth.uid()` ownership internally), `create_ticket_checkout` / `issue_tickets_for_checkout` (authorize via matching payment rows). Audited line by line (SEC-001, 2026-09-04); regression tests partial.
2. **`service_role`-only** — everything that posts money or bypasses ownership: `record_*` (six financial RPCs), `credit_*`, `admin_*`, `apply_moderation_action`, `resolve_report`, `fieldops_*` mutations, `run_financial_reconciliation`, `run_notification_delivery`, `recover_stale_payment_attempts`, `consume_rate_limit`.

`get_advisors(security)` is run after every migration; expected WARNs are the class-1 helpers.

## Immutability and column guards

| Control | Tables |
|---|---|
| Append-only trigger + no UPDATE/DELETE grant | `admin_audit_log` (even service role), `credit_journal`, `credit_entry`, `fieldops_onboarding_event`, `fieldops_commission_event` |
| Immutable rows | `admin_note` (supersede instead), `fieldops_commission_rule` versions, `super_admin` matrix rows |
| Lifecycle-only updates | `fieldops_commission`, `fieldops_payout_batch/item` |
| Column guards (`security invoker`) | `protect_user_info_privileged_columns` (`is_admin`, `status_id`), `protect_event_review_privileged_columns`, `protect_place_review_privileged_columns`, `protect_promo_code_privileged_columns` (only `times_used` writable by buyers) |
| Staff-managed columns | `guard_staff_managed_columns` refuses client writes to `moderation_*`, `place.verified`, `place.claimed` (`20260911080616`) |
| Constraint triggers | `credit_assert_journal_balanced`, `credit_assert_journal_has_entries`; `fieldops_assignment_check` |
| Separation of duty | `fieldops_payout_batch.approved_by <> created_by` CHECK |

A real privilege-escalation bug was fixed on 2026-09-11: `protect_user_info_privileged_columns` was SECURITY DEFINER, so `current_user` was always `postgres` and any user could set `is_admin = true` on their own row. Now `security invoker`.

## Secrets in the database

`observability_config` (health URL + secret) and `notification_delivery_config` (dispatch URL + token) are operator-filled rows readable only by service role. **SEC-004:** the `cleanupExpiredEvents` cron command embeds the service-role JWT inline — move to Supabase Vault and rotate (roadmap item).

## Migrations discipline

- Source of truth: `supabase/migrations/` (204 files). Apply to production **via the Supabase MCP `apply_migration`** and check `get_advisors`; **never `supabase db push`** (remote ledger differs by design).
- Forward-only; never edit an applied file. Replay from scratch is tested by `npm run test:db:up` (CI `integration-tests.yml`) and fingerprint-compared to production (last 2026-09-12).
- Every RLS change is a deliberate, confirmed decision (CLAUDE.md §2).

## Backups and recovery

Supabase-managed backups per plan (retention: confirm in dashboard — decision in `../privacy/data-retention-and-deletion.md` §5). Point-in-time recovery availability depends on the plan. Recovery procedure: `../deployment/rollback-and-recovery.md`.

## Postgres version

Postgres 17 (local config). Production had pending minor-version security patches as of the 2026-09-04 audit (SEC-003, owner's call).
