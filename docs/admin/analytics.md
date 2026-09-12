---
title: Admin › Analytics
purpose: What the platform analytics page measures and how the figures are computed.
audience: analyst, founder, operations
scope: /analytics
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin › Analytics

Source: `packages/services/src/admin/analytics/analyticsAdminCore.ts` (`analytics.view`). Read-only.

| Figure | Computation |
|---|---|
| All-time totals: users, organizers, events (± published), places, tickets | Head-counts on the tables |
| Gross customer payments, net platform revenue | Sums over `platform_fee_entry` (`total_customer_payment`, `net_revenue`) |
| In-range deltas and active organizers | Same tables filtered by `created_at` in the selected range (Africa/Accra) |
| Daily series | Raw `created_at` values bucketed in the server, capped at 50,000 rows per series, drawn as CSS bars |
| Top 10 events by tickets issued; top 10 organizers by gross | `ticket` counts; `platform_fee_entry.event_id → event.organizer_id` |

Caveats: figures are operational, not audited accounts; promotions revenue is included in gross only where a fee entry exists (promotions have no fee entry — see Finance › Overview for charged totals); Field Ops has its own figures under Field Ops › Campaigns › Figures.
