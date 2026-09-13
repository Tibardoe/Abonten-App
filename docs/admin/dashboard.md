---
title: Admin › Dashboard
purpose: Explain each panel and metric on the console dashboard and what to do about the things it flags.
audience: All admin roles
scope: /
status: Approved
version: 1.1
lastReviewed: 2026-09-13
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
| **Needs attention** | Open, urgent and unassigned reports; pending place claims; pending verifications; open error groups; failing health checks; payments stuck over 30 minutes; refunds and payouts waiting. Each tile opens the queue it counts | `admin_dashboard_counts()` — live counts |
| **Platform overview** (time range selectable) | Active users (and all accounts), new users in range, organizers, events published (and all), places, tickets sold and free registrations in range, gross ticket sales, service-fee revenue and cash refunded in range | Counts on `user_info`, `event`, `place`, `ticket`; money from `platform_fee_entry` |
| **Dependency health** | Latest result per health-check key: `self` (is the cron reaching the web app at all), `db`, `auth`, `storage`, `paystack`, `resend`, `hubtel`, `cloudinary`, `expo`, `rewards_health`, `fieldops` | `health_check_result` (probe every 2 min) |

## What the figures mean

| Figure | Definition |
|---|---|
| Active users | Accounts with status Active. Suspended, banned and deleted accounts are reported beside it as "all accounts" |
| New users | Accounts created in the range, whatever their status became afterwards |
| Organizers | People who have published or cancelled at least one event. A draft does not make someone an organizer. Place owners are counted by "Places", not here |
| Events | Published events, with the all-statuses total (including drafts) beside it |
| Tickets sold | Paid tickets issued in the range, minus the ones later cancelled. Free registrations are counted separately |
| Gross ticket sales | What buyers paid for tickets in the range, **before refunds** (`platform_fee_entry` rows of type `fee`) |
| Service fee revenue | Abonten's fee on those sales. It is retained when a ticket is refunded |
| Cash refunded | Money actually sent back in the range — ticket price only, from the `fee_refund_adjustment` mirror rows. A refund that is only *requested* appears under "Refunds pending", not here |

Promotions and subscriptions are not in these money figures; they have no fee entry. Finance › Overview is the full picture.

## Reading the health panel

- **Endpoint reachability (`self`) down** — the pg_cron job could not reach `/api/observability/health` or got a non-2xx (a 401 means the shared secret on the web deployment does not match `observability_config`). Until this is green, the other probes are stale. See `monitoring-and-incidents.md`.
- **Paystack down** — payments will fail at initialisation; refunds and webhooks are delayed. Follow `../incident-response/outages-service-email-push-third-party.md`.
- **Hubtel down** — phone sign-in and phone changes fail; email and Google sign-in continue.
- **Resend down** — ticket emails and reward emails queue or fail; the in-app copy of every notice is unaffected.
- **Expo down** — pushes fail; in-app notifications unaffected.
- **rewards_health / fieldops** — programme backlogs (outbox lag, overdue settlements, sweep lag). Both read "healthy" while the programmes are switched off.

## Dangerous actions here

None — the dashboard is read-only. Links lead to the modules where actions live.
