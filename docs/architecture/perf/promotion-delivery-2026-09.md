---
title: Spotlight promotion delivery simulation (September 2026)
purpose: Record how paid Spotlight promotions deliver, bill and end at a realistic audience size, and how the reach estimate compares, so the S2 pricing assumptions can be judged before real data exists.
audience: Engineering, operations, finance
scope: content_sponsored_candidates, content_view_ingest, content_campaign_accrue, content_campaign_tick, content_campaign_reconcile, content_audience_refresh and @abonten/core/content/promotionEstimate. Local Docker Postgres with simulated viewers; not production behaviour.
status: Approved
version: 1.0
lastReviewed: 2026-09-17
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Spotlight promotion delivery simulation (September 2026)

## How this was run

Script: `scripts/perf/promotion-delivery-simulation.sql` (see `scripts/perf/README.md`). One transaction, rolled back at the end. Pricing: the seeded defaults (GH₵ 11 per 1,000 sponsored impressions, at most 3 sponsored impressions of one promotion per device per day, pacing ×2).

- **Audience**: 8,000 devices; each simulated day about 3,000 of them (37.5 %, chosen at random) open Spotlight once and get one feed page with two sponsored slots.
- **Promotions**, all shown everywhere and started at the same time:

| | Budget | Run | Impressions bought |
|---|---|---|---|
| A | GH₵ 50 | 7 days | 4,545 |
| B | GH₵ 300 | 7 days | 27,272 |
| C | GH₵ 100 | 3 days | 9,090 |

- Each slot takes the first candidate from `content_sponsored_candidates` not already on that page, and the impression goes through `content_view_ingest`. After each day the day's views and the campaigns' dates move back one day, then `content_campaign_tick` runs (spend, completion).

## Results

Per day (impressions delivered that day / running total):

| Day | A | B | C |
|---|---|---|---|
| 1 | 519 / 519 | 2,938 / 2,938 | 2,419 / 2,419 |
| 2 | 535 / 1,054 | 3,030 / 5,968 | 2,495 / 4,914 |
| 3 | 1,293 / 2,347 | 2,950 / 8,918 | 1,657 / 6,571 — run ended |
| 4 | 2,198 / 4,545 — budget delivered | 3,005 / 11,923 | — |
| 5–7 | — | about 3,000 a day / 20,917 — run ended | — |

At the end:

| | Delivered | Reach (devices) | Impressions per device | Spent | Unused | End |
|---|---|---|---|---|---|---|
| A | 4,545 (100 %) | 3,717 | 1.22 | GH₵ 50.00 | GH₵ 0 | budget delivered |
| B | 20,917 (76.7 %) | 7,686 | 2.72 | GH₵ 230.08 | GH₵ 69.92 | run ended |
| C | 6,571 (72.3 %) | 4,964 | 1.32 | GH₵ 72.28 | GH₵ 27.72 | run ended |

- Spend equalled delivered impressions × GH₵ 11 per 1,000 (rounded down) for B and C, and the full budget for A once its goal was reached.
- No device received more than one impression of the same promotion on the same day.
- Pacing held A back early (day 1 allowance 650, day 2 1,948) while B and C, with more to deliver, took most slots; A caught up once the allowance grew and stopped exactly at its goal.
- `content_campaign_reconcile` found no ledger drift, no overspend and nothing live without payment.
- `content_audience_refresh` measured 2,988 daily viewers and 7,736 devices over the period, matching the simulated audience.

## Estimate against delivery

The shared estimator, given the measured audience above:

| | Forecast impressions | Delivered | Forecast reach | Actual reach |
|---|---|---|---|---|
| A | 4,545 | 4,545 | 2,400–3,700 | 3,717 |
| B | 18,824 (69 % of goal) | 20,917 (77 %) | 3,700–4,600 | 7,686 |
| C | 8,067 (89 % of goal) | 6,571 (72 %) | 3,700–4,600 | 4,964 |

What this shows, under these simulated habits:

1. **Reach estimates are conservative.** Actual reach was at or above the top of the range in every case. For B it was far above, because the estimate caps reach at 60 % of the 28-day audience (`max_reach_share_bps`) while this promotion reached almost everyone.
2. **The estimate does not know about other promotions.** C's forecast assumed it had the audience's sponsored slots to itself; sharing two slots per page with A and B, it delivered 72 % against a forecast of 89 %. It was still above the 50 % refusal line, and its unused budget is shown and refundable by staff (decision S3). With many promotions at once, short runs will fall further short of their forecast.
3. **Billing, stopping and reconciliation behave as designed** at this size: no charge beyond delivery, a clean stop at the goal, and the run end recorded with the unused amount.

## Caveats

- Viewer behaviour here is invented: one feed page a day, no organic browsing, uniform interest. Real sessions will differ; these figures test the mechanics, not the market.
- Timings are not the point of this run (about 2.5 minutes for 42,000 slot requests on a laptop container).
- Location targeting is not included; it is covered by the `content-promotions` integration suite.
