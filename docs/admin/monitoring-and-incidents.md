---
title: Admin › Monitoring and incidents
purpose: Read health checks, error groups and request telemetry; run the incident workflow from the console.
audience: operations, engineering, super_admin
scope: /monitoring, /monitoring/errors/[fingerprint]
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin › Monitoring and incidents

Source: `packages/services/src/admin/observability/*`. Incident procedures: `../incident-response/`.

## Health

Real probes run every 2 minutes (pg_cron `abonten-health-check` → `run_scheduled_health_check()` → `GET /api/observability/health` on the web deployment, authenticated by a shared secret): `db`, `auth`, `storage`, `paystack` (`/bank`), `resend` (`/domains`), `hubtel` (auth ping), `cloudinary` (ping), `expo` (push API), plus the programme checks `rewards_health` and `fieldops`, and the synthetic **`self`** row written from the HTTP status the cron got back. A red `self` means the pipeline itself is broken (unreachable endpoint or a 401 from a mismatched `OBSERVABILITY_INGEST_SECRET`); fix that before trusting anything else.

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
