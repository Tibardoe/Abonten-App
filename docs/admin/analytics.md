---
title: Admin › Analytics
purpose: What the platform analytics page measures and how the figures are computed.
audience: analyst, founder, operations
scope: /analytics
status: Approved
version: 1.1
lastReviewed: 2026-09-13
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin › Analytics

Source: `packages/services/src/admin/analytics/analyticsAdminCore.ts` (`analytics.view`). Read-only.

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
| Daily series | Raw timestamps bucketed in the server, capped at 50,000 rows per series, drawn as CSS bars. Days with no activity are missing rather than drawn as zero |
| Top 10 events by tickets issued; top 10 organizers by gross ticket sales | `ticket` counts joined through `ticket_type`; `platform_fee_entry.event_id → event.organizer_id` |

Caveats: these are operational figures, not audited accounts. Money covers **ticket sales only** — promotions and subscriptions have no fee entry, so Finance › Overview is the place for charged totals. A ticket order that covered several events has no `event_id` on its fee entry and is therefore absent from the per-event and per-organizer tables. Field Ops has its own figures under Field Ops › Campaigns › Figures.

## What is not measured

Abonten does not collect age, gender, home city, country or language, and keeps no session or last-active record, so the console has no such breakdowns and none should be inferred. What the data does support — sign-in method, mobile platform of people who allowed push, account status, role mix, repeat and returning buyers — is not on this page yet.
