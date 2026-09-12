---
title: Disputes and chargebacks
purpose: What happens when a buyer disputes a Paystack charge, what the system records automatically, and what finance staff must do.
audience: Finance admins, support leads
scope: Paystack charge.dispute.* events, payment_dispute, payout holds
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Disputes and chargebacks

## What the system does

- The Paystack webhook records every `charge.dispute.*` event in `payment_dispute` (`record_payment_dispute`, upsert by dispute id). A **new** dispute opens one `incident` (Admin › Monitoring) for follow-up.
- No money moves in Abonten: Paystack holds the disputed amount on the merchant balance.
- `payout_guard_review` marks any organizer payout covering an event with an open dispute as `review_status = required`, so the organizer's money for that event waits.
- The rewards engine emits `open_dispute` as a blocking-weight risk flag (80) on related rewards (`reward_emit_dispute`).

## Procedure (finance admin)

1. **Detect:** incident "Payment dispute opened" or the Paystack dashboard.
2. **Confirm:** Finance › Transactions — find the transaction by Paystack reference; note buyer, event, amount, whether tickets were used (check-in).
3. **Contain:** if the buyer appears to be committing friendly fraud (ticket used, then disputed), consider suspending the account (`users.suspend`, reason recorded) after founder sign-off. Hold the organizer payout (it is already `required`).
4. **Evidence:** ticket issuance time, check-in record, the ticket email log (Resend), the buyer's transaction history, in-app messages if relevant (only if reported/support). Assemble within Paystack's response window.
5. **Respond in Paystack** with the evidence (Paystack's dashboard, outside Abonten). Decision F7 covers the internal deadline and template.
6. **Outcome:**
   - Dispute **won**: clear the payout review (`finance.payout.review_clear`) with a note.
   - Dispute **lost**: Paystack debits the amount. In Abonten, issue the refund through Finance › Transactions › Refund so the ledger records the `refund_hold` against the organizer and the transaction reads `refund_pending` → (no Paystack refund will actually process because the charge was reversed; an engineer may need to mark the transaction `refunded` via `record_refund_release` once Paystack shows the reversal). Record the reasoning as an admin note.
7. **Record:** incident updated and resolved; admin notes on buyer and organizer.

## Communicating with the organizer

Tell them a payment dispute is open on their event and their payout for it is held until resolved. Do not share the buyer's identity beyond what the organizer already sees in their attendee list.

## Repeat disputers

Two or more disputes on one account → founder decision on a ban (`users.ban`, step-up).
