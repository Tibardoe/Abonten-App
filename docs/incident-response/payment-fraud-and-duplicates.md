---
title: Runbook — payment fraud, fraudulent tickets, duplicate payments, suspicious organizer
purpose: Respond to fraud around tickets and payments, and to duplicate charges.
audience: Finance admins, moderators, founder
scope: Fake events selling tickets, stolen-card purchases, shared QR codes, duplicate charges, organizers extracting payouts fraudulently
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Runbook — payment fraud, fraudulent tickets, duplicate payments, suspicious organizer

Severity S2; S1 if a fraudulent organizer is about to be paid out or many buyers are affected.

## A. Fraudulent event / organizer

1. **Detect:** reports (`fraud_scam`, `fake_listing`), disputes, a spike of sales on a new organizer, buyers messaging support.
2. **Confirm:** Events › detail (organizer history, sales), Finance › Organizers › [id] (outstanding, pending payout), reports grouped view, Paystack disputes.
3. **Contain:** **Hide** the event (stops discovery; sales still possible via direct link — so also) **suspend the organizer** (`users.suspend`), which blocks their actions; if a payout is `processing`, **Settle… → cancelled**. Note: suspending does not stop existing buyers' tickets.
4. **Preserve:** export transactions for the event, the organizer's ledger, reports, messages (reported ones).
5. **Assess:** number of buyers, total charged, whether the event date has passed, disputes open.
6. **Escalate:** founder decides on cancellation and ban; counsel/police if criminal.
7. **Remediate:** cancel the event to trigger refunds — the organizer cannot (suspended), so an engineer runs `cancelEventCore` on the service role with the founder's approval (records `refundsInitiated`); finance checks every transaction reached `refund_pending`; **Ban** the organizer (step-up); Content › Remove the event.
8. **Communicate:** buyers get the automatic cancellation notice/email; support answers follow-ups with the refund timing.
9. **Verify:** Finance › Refunds shows all refunds; organizer outstanding ≤ 0 handled; no payout completed.
10. **Document / 11. Review:** consider payout holds for new organizers (product decision).

## B. Fraudulent tickets (shared or forged QR)

Tickets are validated by unique `TKT-` code and state; a QR is only a pointer. A "forged" ticket cannot check in (code not found); a **shared** QR checks in once — the second holder fails. Support: explain to the organizer; if a buyer claims their code was stolen, look at check-in time vs their statement; no refund unless the organizer agrees.

## C. Stolen-card purchases

Usually surface as disputes (`disputes-and-chargebacks.md`). Contain by suspending the buyer account; hold the organizer's payout (automatic while the dispute is open); cancel the tickets if not yet used.

## D. Duplicate payments

1. **Confirm:** two `successful` transactions with different Paystack references for one buyer/event; `already_issued` makes a second issuance for one checkout impossible, so duplicates come from two checkouts or a client retry against a new attempt.
2. **Remediate:** Finance › Transactions › Refund the duplicate (step-up). If many buyers are affected at once (a bug), open an S1 incident, stop the deploy (`rollback-and-recovery.md`), and refund in bulk via the admin refund action per transaction.
3. **Review:** find the cause in Sentry; add an integration test.

## E. Rewards-driven fraud

Self-referrals, device sharing, velocity — handled by the engine's risk scoring and the Rewards review queue; freeze accounts and disable codes (`../operations/rewards-operations.md`).
