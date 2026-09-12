---
title: Admin › Dashboard
purpose: Explain each panel and metric on the console dashboard and what to do about the things it flags.
audience: All admin roles
scope: /
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin › Dashboard

Permission: `dashboard.view`. Source: `packages/services/src/admin/dashboard/getDashboardCore.ts` (`admin_dashboard_counts` RPC + health and incidents).

## Panels

| Panel | What it shows | Source of truth |
|---|---|---|
| **KPIs** (time range selectable) | New users, events published, tickets issued, gross customer payments, reports opened | Head-counts on `user_info`, `event`, `ticket`, `platform_fee_entry`, `report` |
| **Dependency health** | Latest result per health-check key: `self` (is the cron reaching the web app at all), `db`, `auth`, `storage`, `paystack`, `resend`, `hubtel`, `cloudinary`, `expo`, `rewards_health`, `fieldops` | `health_check_result` (probe every 2 min) |
| **Needs attention** | Open reports by priority, open incidents, payouts awaiting settlement or review, pending claims, rewards held for review | Live counts |
| **Recent activity** | Latest audit-log rows | `admin_audit_log` |

## Reading the health panel

- **Endpoint reachability (`self`) down** — the pg_cron job could not reach `/api/observability/health` or got a non-2xx (a 401 means the shared secret on the web deployment does not match `observability_config`). Until this is green, the other probes are stale. See `monitoring-and-incidents.md`.
- **Paystack down** — payments will fail at initialisation; refunds and webhooks are delayed. Follow `../incident-response/outages-service-email-push-third-party.md`.
- **Hubtel down** — phone sign-in and phone changes fail; email and Google sign-in continue.
- **Resend down** — ticket emails and reward emails queue or fail; the in-app copy of every notice is unaffected.
- **Expo down** — pushes fail; in-app notifications unaffected.
- **rewards_health / fieldops** — programme backlogs (outbox lag, overdue settlements, sweep lag). Both read "healthy" while the programmes are switched off.

## Dangerous actions here

None — the dashboard is read-only. Links lead to the modules where actions live.
