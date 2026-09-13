---
title: Scheduled jobs (pg_cron and edge functions)
purpose: Every scheduled job in production — what it does, when it runs, how to tell it is healthy, and what breaks if it stops.
audience: Engineering, operations
scope: pg_cron jobs in supabase/migrations, the delete-expired-events edge function
status: Approved
version: 1.0
lastReviewed: 2026-09-13
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Scheduled jobs

The `refresh_search` job was removed on 2026-09-13: it refreshed an `event_search` materialised view that did not exist and failed every 15 minutes. Search now reads indexed columns directly.

All jobs are Postgres `pg_cron` schedules created in `supabase/migrations/` unless noted. Check they are active with `select jobname, schedule, active from cron.job order by 1;` and their last runs in `cron.job_run_details`.

| Job | Schedule | Function | Purpose | If it stops |
|---|---|---|---|---|
| `abonten-health-check` | */2 min | `run_scheduled_health_check()` → `GET /api/observability/health` | Provider probes + synthetic `self` row | Health panel stale; `self` shows down |
| `expire-stale-ticket-checkouts` (+ promotion / subscription variants) | */5 min | `expire_stale_ticket_checkouts()` etc. | Release seats and promo usage from expired checkouts (skips checkouts with a live payment attempt) | Sold-out shows wrongly; seats stuck |
| `recover-stale-payment-attempts` | */5 min | `recover_stale_payment_attempts()` | `processing` > 15 min → `fulfillment_failed` / `pending` | Stuck attempts; reconciliation incident after 1 h |
| `financial-reconciliation` | */30 min | `run_financial_reconciliation()` | Ledger/ticket/inventory/credit/field-ops invariants → incidents | Silent divergence |
| `cleanup-expired-drafts` | hourly (`0 * * * *` style) | `cleanup_expired_drafts()` | Purge expired drafts; queue Cloudinary cleanup | Draft tables grow |
| `purge-reviewed-claim-documents` | 03:00 | `purge_reviewed_claim_documents('30 days')` | Delete claim-document rows 30 days after a decision and queue their bucket objects in `storage_purge_queue` (until 2026-09-13 it deleted from `storage.objects` directly, which Supabase refuses — it failed nightly) | Retention promise broken |
| `purge-verification-evidence` | 03:30 | `purge_verification_evidence()` | Withdraw expired drafts; mark evidence past retention `purged` and queue the objects; queue orphans | Retention promise broken |
| `storage-purge-dispatch` | */10 min | `run_storage_purge_dispatch()` → `POST /api/maintenance/storage-purge` | Delete queued bucket objects through the Storage API (only SQL cannot); 8 attempts then `failed` | Queued objects linger in buckets (rows are already gone); check `storage_purge_queue` where `status = 'failed'` |
| `event-reminders` | hourly (:07) | `event_reminders_enqueue()` | "Tomorrow: <event>" in-app notice + queued push for active ticket holders of a session 23–25 h away, once per person per session; skips people with their own app reminder | No day-before reminders |
| `cleanup-rate-limit-buckets` | 04:00 | `cleanup_rate_limit_buckets()` | Purge 1-day-old buckets | Table grows (no functional impact) |
| `credit-expire-lots` | 02:00 | `credit_expire_due_lots(5000)` | Expire credit lots | Expired credit stays spendable |
| `credit-release-stale-reservations` (part of rewards jobs) | periodic | `credit_release_stale_reservations` | Return credit from abandoned checkouts | Credit stuck reserved |
| `rewards-process-outbox` | every minute | `rewards_process_outbox(200)` | Evaluate reward events from the outbox | Rewards lag; dead letters after 8 tries |
| `rewards-settle-due` | */15 min | `rewards_settle_due(500)` | Release/void pending rewards after events settle | Rewards never release |
| `rewards-notify-pending` | 18:00 | `rewards_notify_pending()` | Nudge notices for pending credit | — |
| `rewards-monthly-rebates` | 03:00 on the 3rd | `rewards_run_monthly_rebates(null,null)` | Organizer/venue rebates, milestones, place visits | Run by hand from Admin › Rewards › Rebates |
| `referral-touch-purge` | daily | `referral_purge_old_touches()` | 90-day retention on referral clicks | Retention promise broken |
| `notification-delivery` | every minute | `run_notification_delivery()` → `POST /api/notifications/deliver` | Reward pushes/emails, app pushes for SQL-written notices, recommendation digests | Reward/review/cancellation/recommendation pushes stop |
| `fieldops-eligibility-sweep` | */15 min | `fieldops_run_eligibility_sweep(200); fieldops_sweep_content(200)` | Confirm field commissions after holding (no-op while the programme is off) | Field commissions never approve; `fieldops` health lag |
| `fieldops-housekeeping` | 02:25 | `fieldops_run_housekeeping()` | Close stale reviews; count evidence due for purge | — |
| `search-log-purge` | 03:35 | `search_log_purge()` | Delete search analytics older than `search_log_retention_days` (90) | Retention promise broken |
| `recommendations-generate` | */15 min | `recommendations_generate(200)` | Turn newly published events and places into picks for people who opted in (no-op while the engine is off) | New listings never reach alerts or For you |
| `recommendations-digest` | */10 min | `recommendations_build_digest(20000, false)` | In the digest hour (18:00 Accra) build at most one capped digest per person and queue its push; each run continues where the last stopped | No recommendation notices |
| `recommendations-purge` | 03:40 | `recommendations_purge()` | Delete picks after 90 days, digests after 180, skip records after 30 | Tables grow; retention promise broken |
| `weekly-publish-due` | */5 min | `weekly_publish_due()` | Publish scheduled Abonten Weekly editions whose time has come; one that fails its checks stays scheduled and opens an incident | Scheduled editions never go out; `weekly` health check down after 15 minutes |
| `weekly-housekeeping` | 02:45 | `weekly_housekeeping()` | Remove edition listings whose event or place was deleted; archive editions older than `edition_retention_weeks` (104) | Orphan rows (hidden from readers anyway); old editions stay unarchived |
| `cleanupExpiredEvents` | 00:00 | `net.http_get` → edge function `delete-expired-events` → `archive_or_delete_expired_event` | Archive/delete ended events; destroy flyers of hard-deleted ones | Ended events linger (harmless); **SEC-004: the service-role JWT is inline in this cron command — move to Vault (roadmap)** |

## Operating notes

- Jobs calling the web app (`abonten-health-check`, `notification-delivery`, `storage-purge-dispatch`) depend on `observability_config` / `notification_delivery_config` / `storage_purge_config` rows holding the deployment URL and token. After a domain change, update those rows. `storage_purge_config.dispatch_url` was derived from the notification one when the migration ran; if it is NULL nothing is dispatched and the queue simply grows.
- `fieldops_job_run` records every sweep with wall-clock duration (`clock_timestamp()` trigger); `fieldops_health()` exposes `sweep_seconds`.
- Nothing has retry/dead-letter beyond each function's idempotency, except the rewards outbox (8 attempts → dead letter → incident).
- Migrations that (re)schedule a job use `cron.schedule` with a job name; never edit `cron.job` by hand in production.
