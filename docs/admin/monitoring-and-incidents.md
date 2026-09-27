---
title: Admin › Monitoring and incidents
purpose: Read health checks, error groups and request telemetry; run the incident workflow from the console.
audience: operations, engineering, super_admin
scope: /monitoring, /monitoring/errors/[fingerprint]
status: Approved
version: 1.1
lastReviewed: 2026-09-27
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin › Monitoring and incidents

Source: `packages/services/src/admin/observability/*`. Incident procedures: `../incident-response/`.

## Health

Real probes run every 2 minutes (pg_cron `abonten-health-check` → `run_scheduled_health_check()` → `GET /api/observability/health` on the web deployment, authenticated by a shared secret): `db`, `auth`, `storage`, `paystack` (`/bank`), `resend` (`/domains`), `hubtel` (auth ping — reachability only: an account that answers but will not send, such as an unpaid balance, stays green), **`otp`** ("Text-message codes (sending)", since 2026-09-27: down when every code send attempted in the last 30 minutes was refused by the provider; each refusal is also an `OtpSendFailed` error group under Errors with the provider's own words, phone numbers masked — see `packages/services/src/profile/otpSendMonitoring.ts`), `cloudinary` (ping), `expo` (push API), plus the programme checks `rewards_health`, `fieldops` and `weekly` ("Abonten Weekly schedule": down when a scheduled edition is over 15 minutes late, or no Ghana edition is out by 09:00 Monday while the programme is on; a failed scheduled publish also opens an incident with component `weekly`), **`cron`** ("Scheduled jobs", since 2026-09-26: down when any active pg_cron job's latest run failed or a run has been "running" for over 30 minutes; the detail names the failing jobs and their error — `cron_health()` reads the newest 5,000 runs, and `purge-cron-run-details` keeps 14 days of history), and the synthetic **`self`** row written from the HTTP status the cron got back. A red `self` means the pipeline itself is broken (unreachable endpoint or a 401 from a mismatched `OBSERVABILITY_INGEST_SECRET`); fix that before trusting anything else.


### Alerts (since 2026-09-26)

Nobody used to be told when something broke: the Abonten Weekly check was red for five days before anyone looked. Now, after every health run:

- a check that has **failed 3 runs in a row** (about 6 minutes) opens an incident — component `health.<check>`, severity high — unless one is already open for it (`health_escalate_failing`);
- every **new open incident**, whatever opened it (a health check, the financial or credit reconciliation, the rebate run, Spotlight promotions), is **emailed once** to every active super-admin's sign-in address from the Abonten Monitoring sender, with a link back here (`incident_alert_claim` / `incident_alert_recipients`). A failed send is retried on the next run.
- Only production sends email; preview deployments never do.

Resolving the incident here is what stops further alerts for that check; a check that recovers and later fails again while its incident is still open does not email again. Resolve incidents once the cause is fixed.
## Errors

- **Error groups** (self-hosted): one row per fingerprint from `app_error_event` reported by the web (`/api/observability/error`) and the mobile app, with counts, first/last seen, status (open / acknowledged / resolved / ignored). Detail page: recent samples with stack, route, platform, app version, severity; breakdown by platform / version / route. Status controls need `monitoring.manage`; changes are audited (`error_group.status`).
- **Sentry** holds the richer traces for web (`abonten-web`), admin (`abonten-admin`, the only sink for the console) and mobile (`abonten-mobile`). The console does not embed Sentry; use sentry.io. `/monitoring/sentry-check` is a controlled test route that raises a known error.

## Request telemetry

`app_request_metric` — sampled mobile API timings (hourly view). Web/API request performance is Sentry's job.

## Incidents

`incident` rows: title, status (`investigating → identified → monitoring → resolved`), severity (low / medium / high / critical), component, summary; `resolved_at` stamped on resolve. Created by staff (`incidents.manage`, no step-up) **and automatically** by `run_financial_reconciliation()` (one per failing check, re-used while open), by the rewards engine (dead letters, stuck reservations, rebate failures) and by the Paystack dispute webhook.

### Procedure

1. Create the incident as soon as you start work on anything user-affecting (`investigating`).
2. Update status/summary as you go; link the error group or transaction in the summary.
3. Resolve with what was done. The audit log records `incident.create` / `incident.update`.

Post-incident review notes live in `../incident-response/` (template in its README).
