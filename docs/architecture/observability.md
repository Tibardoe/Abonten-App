---
title: Observability
purpose: Describe how errors, health, request timing and incidents are captured and where to look — the self-hosted pipeline that feeds the admin console and the Sentry projects that sit alongside it.
audience: Engineers, on-call responder, admins using Monitoring
scope: apps/web observability routes, the observability tables and pg_cron health check, Sentry in web, admin and mobile
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Observability

Two systems run side by side. The **self-hosted pipeline** is primary: it writes to Postgres tables that Admin › Monitoring reads, so the operations view needs no external account. **Sentry** is secondary for web, and the only sink for the admin console (which has no self-hosted pipeline) and for native crashes on mobile.

## Self-hosted pipeline

| Signal | Producer | Ingest | Storage | Consumer |
|---|---|---|---|---|
| Application errors | `@abonten/core/reportError` (`packages/core/src/reportError.ts`) from web, API routes and the mobile app's `reportClientError` | `POST /api/observability/error` (`apps/web/src/app/api/observability/error/route.ts`) — accepts a signed-in user's request or a server-to-server call carrying the shared ingest secret header | `app_error_event` (one row per occurrence) grouped into `app_error_group` (fingerprint, first/last seen, count, status) | Admin › Monitoring › Errors; error-group detail and the incident workflow |
| Health of dependencies | `run_scheduled_health_check()` (pg_cron job `abonten-health-check`, every 2 minutes) reads `observability_config` for the deployment URL and token and calls `GET /api/observability/health` (`apps/web/src/app/api/observability/health/route.ts`) | The route runs real probes against the providers and returns one result per key | `health_check_result` per probe, plus a synthetic `check_key = 'self'` row written by the SQL function from the HTTP status it received — so an unreachable or rejected endpoint shows as "Endpoint reachability — down" instead of an empty panel | Admin › Monitoring › Health; dashboard tiles |
| Request timing (mobile) | The mobile API client records duration per request | `POST /api/observability/metric` (`apps/web/src/app/api/observability/metric/route.ts`) | `app_request_metric` | Admin › Monitoring › Request telemetry |
| Incidents | Admins, from an error group or by hand | Admin console actions | `incident` (severity, status, timeline) | Admin › Monitoring › Incidents; `incident-response/README.md` |
| Domain health | `fieldops_health()` and the rewards health view expose sweep age, queue depth and job timing | Read by the health route as additional keys | `health_check_result` | Same panel |

Tables were introduced by `supabase/migrations/20260903215825_observability_tables.sql`; the health-check schedule by `supabase/migrations/20260903231047_schedule_health_check.sql`; the synthetic self row by `supabase/migrations/20260904121854_health_check_self_report.sql`.

**Retention:** none of these tables has a retention job (decision R6; design in `../specifications/retention-jobs.md`).

**Configuration:** the deployment URL and the ingest token live in `observability_config` — a database row, not an environment variable — so the cron job survives redeploys; after a domain change, update that row (`../operations/scheduled-jobs.md`). The web route validates the token from `OBSERVABILITY_INGEST_SECRET`.

## Sentry

One organisation, three projects, three different DSNs, one org-level auth token used only by CI and EAS for source-map upload (never bundled).

| App | Project | Setup | Notes |
|---|---|---|---|
| Web | `abonten-web` | `apps/web/src/instrumentation.ts` and `apps/web/src/instrumentation-client.ts`; `withSentryConfig` in `apps/web/next.config.ts` | Enabled only in production builds; `tracesSampleRate: 0.1`; `sendDefaultPii: false`; **no Session Replay**. The self-hosted error route also forwards events tagged `web` / `api` |
| Admin | `abonten-admin` | `apps/admin/src/lib/sentry.ts` factory used by the three inits | Drops the expected `AdminUnauthenticated` / `AdminForbidden` throws; redacts cookies, headers, tokens and query strings in `beforeSend`; tags requests with the admin id and roles; a `captureAdminActionError()` bridge for swallowed Server Action failures; a controlled test route under `/monitoring/sentry-check` |
| Mobile | `abonten-mobile` | `apps/mobile/src/lib/sentry.ts`, `Sentry.wrap` on the root layout, the Expo config plugin for source maps | `enabled: !__DEV__ && dsn`; runs alongside the self-hosted `reportClientError` pipeline |

Preview and production are separated by the `environment` tag. Sentry's own data retention follows its plan; the privacy inventory records Sentry as a processor (`../privacy/third-party-processors.md`).

## Where to look, by question

| Question | Where |
|---|---|
| Is anything down right now? | Admin › Monitoring › Health (`self`, Paystack, Hubtel, Resend, field-ops and rewards keys); `../incident-response/outages-service-email-push-third-party.md` |
| Are errors spiking? | Admin › Monitoring › Errors (groups by last seen); Sentry for stack traces with source maps; `../incident-response/sentry-and-error-rate.md` |
| Is the mobile app slow? | Admin › Monitoring › Request telemetry (`app_request_metric`); the 2026-09 root cause was Vercel region vs Supabase region — the web project is pinned to `cdg1` |
| Did a scheduled job run? | `../operations/scheduled-jobs.md` (each job's health signal); `cron.job_run_details` via the Supabase MCP |
| What did staff do? | `admin_audit_log` — Admin › Audit Logs (`../admin/audit-logs.md`) |
| Was a payment fulfilled? | Admin › Finance › Transactions › full trace (`../finance/payments-and-ticketing-runbook.md`) |

## Gaps

- No alerting: nobody is paged. The health panel and Sentry email digests are the only notifications (decision S1 covers who responds).
- No retention on the observability tables (R6).
- Web and API request performance is Sentry's job (10% trace sampling); there is no self-hosted web timing.
- Uptime is inferred from the cron-driven `self` row, which only tells you the database could reach the web app every two minutes; there is no external uptime monitor.
