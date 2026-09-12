---
title: Specification — retention jobs
purpose: List every data set without a retention period, the jobs that already exist as patterns, and a proposed architecture that can enforce whatever periods are decided — without choosing any period here.
audience: Legal counsel, finance, founder, engineering
scope: Supabase tables and storage buckets, Cloudinary media, pg_cron jobs
status: Draft
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Specification — retention jobs

**No retention period is chosen in this document.** Periods are legal item B3 (and B9 for ledgers and audit logs) and decisions R1–R9 in [../OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md). The Privacy Policy already says "to be confirmed" for each of these.

## 1. What exists today (patterns to reuse)

From [../privacy/data-retention-and-deletion.md](../privacy/data-retention-and-deletion.md) §1 and [../operations/scheduled-jobs.md](../operations/scheduled-jobs.md):

| Existing job or mechanism | What it does | Pattern worth copying |
|---|---|---|
| Draft purge (hourly) | Deletes stale event/place drafts | Simple `delete … where updated_at < now() - interval` inside a SQL function scheduled by pg_cron |
| Claim-document purge (30 days after decision) | Removes storage objects **and** rows | Storage + row deletion in one job; demonstrates bucket cleanup from SQL |
| `rate_limit_bucket` purge (1 day) | Deletes expired buckets | Tiny, frequent |
| `referral_touch` purge (90 days) | Deletes old touches | Batch delete with a limit |
| Credit lot expiry | Expires reward lots on schedule | Status change rather than delete |
| Event archive/delete Edge Function (daily) | Hard-deletes events without ledger history; archives the rest | Shows the "anonymise or archive, never delete what a ledger references" rule |
| Field-ops housekeeping | **Counts** evidence due for purge (`evidence_due_for_purge`) but does not delete | The counting step is exactly the dry-run every new purge should start with |
| Cloudinary destroy on media replace/remove | Deletes remote media | External media deletion requires an HTTP call from the app, not SQL |

## 2. Data sets without a period (the decision inputs)

| Register | Data set | Where | Deletion shape once a period exists | Dependencies |
|---|---|---|---|---|
| R1 | `transaction`, `ticket`, `ticket_checkout`, `payment_attempt` | Postgres | **Anonymise**, do not delete: ledgers and refunds reference them. Replace buyer-identifying columns; keep amounts and references. | Financial record period from counsel (B3, E3) |
| R2 | `organizer_ledger_entry`, `payout`, `platform_fee_entry`, credit ledger | Postgres, append-only by trigger | Likely **never deleted**; if a period is set, archive to cold storage then delete via a maintenance migration that bypasses the append-only trigger deliberately and auditably | B9 |
| R3 | Messages, attachments, reactions | Postgres + storage bucket + Cloudinary (media, voice notes) | Delete rows and objects a period after both participants are gone or the conversation is archived by both; voice notes and media are external objects | R3 period; user-initiated conversation deletion is a separate product gap |
| R4 | `notification`, `notification_delivery` | Postgres | Delete delivered/read rows after the period; keep failed rows for the same window | R4 period |
| R5 | `phone_otp_send_log` | Postgres | Delete after the period | R5 period |
| R6 | `app_error_event`, `app_request_metric`, `health_check_result` (raw); `app_error_group`, `incident` (keep) | Postgres | Delete raw rows after the period; groups and incidents kept | R6 period |
| R7 | Field evidence (`fieldops-evidence` bucket) | Storage | Delete objects `evidence_due_for_purge` already identifies; then null the row's storage reference | Keep 365 or change it (R7) |
| R8 | `report`, `report_attachment`, `report_event` | Postgres + storage | Anonymise reporter, delete attachments after the period; keep the moderation outcome | R8 period; depends on M2/O4 windows |
| R9 | `admin_audit_log` | Postgres, append-only | None (permanent) unless counsel says otherwise | B9 |
| — | Supabase backups | Provider | Governed by the plan; deleted data persists until backups rotate | Confirm and record (S6) |
| — | Cloudinary media of deleted accounts | Cloudinary | Not purged today (security register). A purge needs an HTTP job listing assets by the user's folder or tag | Decision needed; also a security item |
| — | Data-export files (if [data-export.md](data-export.md) is built) | Storage | Delete at `expires_at` | Part of O3 |

## 3. Proposed architecture

1. **A `retention_policy` table** — one row per data set: `key` (e.g. `notification_delivered`), `period_days integer null`, `mode` (`delete | anonymise | archive`), `enabled boolean default false`, `updated_by`, `updated_at`. **All rows ship with `enabled = false` and `period_days = null`**; a decision is recorded by setting both, through a migration or an admin Settings action with step-up and an audit entry. The table itself is the "decision applied" record.
2. **One SQL function per data set** — `retention_purge_<key>(p_limit int, p_dry_run boolean)` that returns the count affected. With `p_dry_run = true` it only counts (the field-ops housekeeping pattern). Each function reads its own policy row and does nothing when disabled or when the period is null.
3. **A single dispatcher** — `run_retention_purges(p_limit)` scheduled by pg_cron nightly, iterating enabled policies, calling each function in batches, and writing a `retention_run` row per data set (started, finished, counted, affected, error). Batching keeps locks short; the dispatcher stops a data set early when a batch errors.
4. **External objects** — for storage buckets, the SQL function can remove objects (as the claim-document purge does). For Cloudinary and voice notes hosted there, a route under the app (`/api/…`, cron-only, token from a config row like `notification_delivery_config`) receives the list of asset identifiers and destroys them; the SQL side marks rows `purge_pending` until the route confirms.
5. **Anonymisation** — for R1 and R8, a fixed set of column rewrites (name → "Deleted user", email/phone → null, free text → null) implemented in one function so the rule is the same everywhere; ledgers stay intact.
6. **Observability** — the Admin › Monitoring health panel gains a `retention` key (last run age, last error) using the existing health-check pattern; each run is visible in Admin › Settings.
7. **Documentation hooks** — when a policy is enabled, update the Privacy Policy §9 table, [../privacy/data-retention-and-deletion.md](../privacy/data-retention-and-deletion.md), the register row, and the changelog; run `npm run check:docs`.

## 4. Safety rules for the implementation

- Never delete anything a ledger references; anonymise instead.
- Every purge function must be dry-runnable and batch-limited.
- Apply through the normal migration process; never `supabase db push`.
- Run the integration suite with a test that seeds each data set, sets a policy, runs the dispatcher, and asserts the count and the untouched ledger rows.
- Legal holds (see [../privacy/data-retention-and-deletion.md](../privacy/data-retention-and-deletion.md) §6) must be able to disable a policy for a named user or record; the first version can implement holds as an `enabled = false` switch per data set, with per-record holds added later.

## 5. Approval required before implementation

| Item | Decision needed | Register |
|---|---|---|
| Period and mode for each data set R1–R9 | Founder with counsel and finance | Decisions R1–R9; legal B3, B9, E3 |
| Confirm backup retention and objectives | Founder | Decision S6 |
| Build the framework (table, dispatcher, dry-run functions) with all policies disabled | Founder approves engineering work | Any one R decision, or approval to build ahead with everything disabled |
| Cloudinary purge for deleted accounts | Founder | Security register item; add a decision row when approved |

**Status: not approved. No period is set and no purge job is to be added until the relevant R item is Decided.**
