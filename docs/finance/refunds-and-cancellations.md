---
title: Refunds and cancellations (operations)
purpose: The exact refund rules and procedures — buyer cancellation, organizer cancellation, admin-initiated refund, retry, and the cash/credit split.
audience: Finance admins, support leads, engineering
scope: Ticket refunds through Paystack; promotions (non-refundable); credit refunds
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Refunds and cancellations (operations)

## Rules the code enforces

1. **Refund amount = ticket price only.** `issueRefundCore` (`packages/services/src/organizer/issueRefundCore.ts`) asks `get_transaction_refundable_amount(transaction_id)` for the proportional `gross_amount` of the cancelled tickets and requests a **partial** Paystack refund of exactly that. **The service fee is retained** and recorded by `record_fee_refund_adjustment`.
2. **Refund is requested, then confirmed.** `record_refund_hold` moves the transaction to `refund_pending` and writes a negative `refund_hold` on the organizer ledger. The Paystack webhook `refund.processed` moves it to `refunded` (`record_refund_release` finalises the ledger); `refund.failed` returns it to `successful` with `refund_requested_at` set, and the buyer sees **Retry refund**.
3. **Idempotent.** `issueRefundCore` checks `transaction.status` first; a repeat call on `refund_pending`/`refunded` does nothing except finish a missing credit step.
4. **Cancelling a ticket** (`cancelUserTicketCore`) releases the inventory unit and requests the refund for that ticket's share; already-cancelled tickets return success without repeating anything.
5. **Orphan transactions** (no linked tickets — 5 early-2026 test rows) return 400 "No tickets are linked to this payment" and are refunded manually if ever needed.
6. **Promotions are not refundable** in code (no refund path exists); a failed activation with credit captured is corrected by an audited credit adjustment.

## Procedures

### A. Buyer cancels (self-service)

Web My Tickets / app Tickets → Cancel ticket → `cancelUserTicket` → `cancelUserTicketCore` → `issueRefundCore` (buyer context). Nothing for staff to do unless the refund fails.

### B. Organizer cancels an event

`cancelEvent` → RPC `cancel_event_and_release_tickets` (atomic: event `canceled`, tickets/attendance/checkouts cancelled, one notification per attendee) → `issueRefundCore` on the **service-role client** for each refundable transaction (`Promise.allSettled`) → cancellation emails via `after()`. The action returns `{refundsInitiated, refundsFailedToStart}`; failures show as *Refund failed* to the buyer with Retry.

**Staff check after a large cancellation:** Admin › Finance › Refunds — every transaction for the event should be `refund_pending`; Finance › Organizers › organizer shows the `refund_hold` entries. If some are still `successful`, run the admin refund on each (step C).

### C. Admin-initiated refund

Admin › Finance › Transactions › [transaction] › **Refund** (`finance.refund`, step-up, reason required) → `refundTransactionAdminCore` → `issueRefundCore` (service-role, no buyer check). Audit action `finance.refund`. Use for: support-approved refunds, retrying a failed request, fulfilling a court/regulator instruction.

### D. Refund failed

Buyer: *Retry refund*. Staff: check Paystack dashboard for the refund's status; common causes are Paystack balance too low (refunds draw on the merchant balance) or a settlement not yet available. Retry via step C once resolved.

### E. Refund confirmed by Paystack but still `refund_pending` in Abonten

The webhook did not arrive or failed. Check the webhook route errors (Sentry), replay the event from the Paystack dashboard. If replay is impossible, an engineer calls `record_refund_release` for the transaction on the service role and records an admin note.

### F. Credit-funded purchases

When a ticket was paid partly with Abonten Credit, `refundTenderSplit` splits the refund pro rata: the cash part goes to Paystack, the credit part back to the buyer's credit account via `credit_refund_redemption` (`credit_refunded_amount` on the transaction). If the credit step failed, re-running the refund (step C) completes it idempotently.

### G. Goodwill

Where Abonten's systems failed a customer, an admin with `rewards.goodwill` can grant up to GH₵ 50 per user per month of Abonten Credit (`credit_grant_goodwill`); larger amounts go through `finance.adjust` (maker-checker ≥ GH₵ 500). Cash goodwill has no tool today — use a refund (step C) if a transaction exists. Policy limits: decision F5.

## Communications

Never tell a customer a refund is "complete" until `transaction.status = refunded`. The cancellation email already says "processing". Refund timing after Paystack confirmation is the bank's or network's, not Abonten's.

## Escalation

Refunds over the organizer's outstanding balance (creating a negative balance), disputes, or anything involving a suspended organizer → founder. Suspected fraud → `../incident-response/payment-fraud-and-duplicates.md`.
