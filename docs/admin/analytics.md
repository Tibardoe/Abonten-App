---
title: Admin › Analytics
purpose: What the platform analytics page measures and how the figures are computed.
audience: analyst, founder, operations
scope: /analytics
status: Approved
version: 2.0
lastReviewed: 2026-09-13
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin › Analytics

Source: `packages/services/src/admin/analytics/analyticsAdminCore.ts` (`analytics.view`), reading `admin_dashboard_kpis`, `admin_platform_analytics` and `admin_user_demographics`. Read-only.

Every figure on the page carries its definition behind the ⓘ beside it; the same wording is in [metrics.md](metrics.md). The period control offers today, 7, 30 and 90 days, this year and a custom range; each figure states the window it covers and how it compares with the equivalent window before it.

| Figure | Computation |
|---|---|
| Active users | `user_info` rows with status Active. Suspended, banned and deleted accounts are excluded |
| Organizers | Distinct organizers of at least one non-draft event. Place owners are counted by "Places" |
| Events | Published count, with the all-statuses total (drafts included) beside it |
| Tickets issued | `ticket` rows excluding cancelled ones — paid tickets and free registrations together |
| Gross ticket sales | Σ `ticket_revenue` over `platform_fee_entry` rows of type `fee` — **before refunds**. The `fee_refund_adjustment` mirror rows are not netted off |
| Net platform revenue | Σ `net_revenue` over the same `fee` rows, counting only rows whose Paystack processing cost was reported. A NULL cost is unknown, not zero, so those rows are left out |
| In-range figures | The same tables filtered to the selected window (Africa/Accra): users, events and places by `created_at`, tickets by `issued_at`, money by the fee entry's `created_at` |
| Organizers who added an event | Distinct organizers of events created in the range. It does not mean they sold anything |
| Charts | One point per hour, day or week depending on the range, built with `generate_series` so a period with no activity is a real zero rather than a missing point. Each chart carries a one-sentence summary for screen readers and the same numbers as a hidden table, and draws the previous period as a dashed line |
| Top 10 events by tickets issued; top 10 organizers by gross ticket sales | `ticket` counts joined through `ticket_type`; `platform_fee_entry.event_id → event.organizer_id` |

Caveats: these are operational figures, not audited accounts. Money covers **ticket sales only** — promotions and subscriptions have no fee entry, so Finance › Overview is the place for charged totals. A ticket order that covered several events has no `event_id` on its fee entry and is therefore absent from the per-event and per-organizer tables; the page says how much that is. Field Ops has its own figures under Field Ops › Campaigns › Figures.

## Who uses Abonten

| Breakdown | What it is | Watch out |
|---|---|---|
| What people do here | Active accounts split into organizers, place owners, buyers and people with no activity yet, each counted once in the widest role they hold | Someone who organizes *and* buys appears only under organizers |
| How people sign in | The provider each account was created with (Google, phone, email), from `auth.users` | Someone can link more than one method; each account is counted once |
| Mobile platforms | Distinct people with a push-enabled device, by platform (`device_token`) | Covers only people who installed the app **and** allowed notifications. It is not a share of all users, and web-only users do not appear |
| Account status | Every account by status — active, suspended, banned, deleted | — |
| Buyers, repeat buyers, buyers among users, returning buyers | People with a captured payment; with two or more; as a share of active accounts; and the share of the previous period's buyers who bought again | A percentage is withheld when the sample is under five people |

Groups small enough to identify a person are withheld, and a second group is withheld with them so the first cannot be recovered by subtracting from the total (`@abonten/core/admin/smallSample`). Suppression applies to the person-describing breakdowns — sign-in method and platform. Account status and role mix are shown in full: the same counts are already on the Users and Organizers pages, so hiding them buys no privacy.

## What is not measured, and why

Abonten does not collect age, gender, home city, country or language, and keeps no session or last-active record. There are therefore no such breakdowns in the console, and none should be inferred from the ones that exist:

- **Location**: only events and places have coordinates. Mapping buyers to the events they attended would describe where events are, not where people live.
- **Age and gender**: no column exists anywhere in the schema. Nothing may be estimated from names or photographs.
- **Device model, operating system version, session length**: not recorded. The platform mix above is the device someone registered for notifications, nothing more.
- **Acquisition channel**: referral capture is part of the rewards programme and is switched off, so those tables are empty.
- Money crossed with any of the above is not shown: the groups become small immediately, and no operational decision depends on it.
