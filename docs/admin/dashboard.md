---
title: Admin › Dashboard
purpose: Explain each panel and metric on the console dashboard and what to do about the things it flags.
audience: All admin roles
scope: /
status: Approved
version: 1.2
lastReviewed: 2026-09-13
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin › Dashboard

Permission: `dashboard.view`. Source: `packages/services/src/admin/dashboard/getDashboardCore.ts`, one call to `admin_dashboard_kpis()` (which includes `admin_dashboard_counts()` and the latest health rows).

The period control offers today, the last 7, 30 and 90 days, this year and a custom range. Windows are whole calendar days in Africa/Accra, today included and marked as still in progress; the caption under the heading names the exact dates and the equivalent earlier window every trend is measured against. A figure with no earlier data reads "New" rather than a percentage; a figure that is exactly zero says whether that means "nothing in this period", "nothing right now" or "nothing yet".

## Panels

| Panel | What it shows | Source of truth |
|---|---|---|
| **Needs attention** | Open, urgent and unassigned reports; place claims; verification requests; open error groups; failing health checks; payments stuck over 30 minutes; refunds to issue; payouts in flight. Each tile opens the queue it counts, and an empty queue says "Nothing waiting" | `admin_dashboard_counts()` — live counts, right now |
| **Activity** (period control) | Tickets sold (with later cancellations), gross ticket sales (with orders that used Abonten Credit), net platform revenue (with how many payments have a known Paystack cost), cash refunded, new users, free registrations, new events, organizers who sold — each against the equivalent earlier window | `admin_dashboard_kpis()` over `ticket`, `platform_fee_entry`, `user_info`, `event`, `place` |
| **Platform totals** | Active users (and all accounts), organizers (and place owners), events published (and all), places — as they stand today | `admin_dashboard_kpis()` snapshot |
| **Dependency health** | Latest result per probe, named in English (`self` is "Web endpoint"), with how long ago it ran; a probe silent for 15 minutes shows **stale** rather than disappearing | `health_check_result`, newest row per key |

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
