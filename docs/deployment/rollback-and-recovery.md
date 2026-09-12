---
title: Rollback and recovery
purpose: How to undo a bad release on each layer, use the kill switches, and recover data.
audience: Engineers, founder
scope: Vercel, EAS, Supabase, feature flags/kill switches, backups
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Rollback and recovery

## Web / admin (Vercel)

Vercel → Deployments → previous production deployment → **Promote to Production** (instant). Also revert the commit on `main` so the next push does not redeploy the bad code. Server Actions and API routes roll back with the deployment; the database does not.

## Mobile (EAS Update)

`eas update --republish --group <previous update group> --channel production` (or roll back the branch/channel mapping). Native builds cannot be rolled back on users' devices; ship a fixed build or an update that disables the feature.

## Database

Forward-only: write and apply a new migration that reverts. If data was destroyed, recover from Supabase backups (dashboard → Backups; PITR if the plan includes it) into a **new** project or table and copy rows back through audited RPCs — never restore over production wholesale without the founder's decision. Backup retention: confirm in the dashboard (privacy decision).

## Kill switches and flags (no deploy needed unless noted)

| Lever | Where | Effect |
|---|---|---|
| Rewards programme | Admin › Rewards › Settings "Program switched on"; or `REWARDS_KILL_SWITCH=true` (web env, redeploy) | UI hidden, no credit posted / spent |
| Field programme | Admin › Field Ops › Settings (programme / worker UI / commission generation / payouts); or `FIELD_OPS_KILL_SWITCH=true` (web + admin env) | `/field` 404, sweep no-op, batches blocked |
| Paystack Transfers | `PAYSTACK_TRANSFERS_ENABLED` unset (web + admin) | Send-payout action returns 409; manual transfers |
| Reward notifications | Admin › Rewards › Settings › Notifications switches | Stop reward pushes/emails |
| Campaign | Pause / wind down in Admin › Field Ops | Stops field work per region |
| Account | Users › Suspend | Revokes sessions |
| Admin | Admin Settings › Disable | Locks out an admin |
| Cron job | `select cron.unschedule('<name>')` via MCP (record it; re-schedule with a migration) | Stops a job |

## Recovery verification

Health green, reconciliation clean, a signed-out page load, a sign-in, a test payment on preview, one push, one email; incident row resolved with the timeline.
