---
title: Refunds and cancellations (operations)
purpose: The exact refund rules and procedures — buyer cancellation, organizer cancellation, admin-initiated refund, retry, and the cash/credit split.
audience: Finance admins, support leads, engineering
scope: Ticket refunds through Paystack; promotions (non-refundable); credit refunds
status: Approved
version: 1.2
lastReviewed: 2026-10-30
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Refunds and cancellations (operations)

## Rules the code enforces

1. **Refund amount = ticket price only, ticket by ticket.** A payment made in cash (card or mobile money) is refunded per cancelled ticket (2026-10-30): `issueRefundCore` (`packages/services/src/organizer/issueRefundCore.ts`) calls `refund_prepare`, which picks the cancelled tickets no live refund covers and prices them as their share of their checkout line — cumulatively, so a line's parts add up to what was paid for it (three tickets of a GH₵100 line: 33.33, 33.34, 33.33) — and asks the provider for exactly that (a **partial** refund keyed by the part, so two parts of the same amount stay two refunds). **The service fee is retained**: a `fee_refund_adjustment` row tagged with the part's `refund_id` is written when the part is confirmed. A payment made partly with Abonten Credit, or paid small small, is refunded **as a whole** (`get_transaction_refundable_amount`, `record_fee_refund_adjustment`), so its tickets are cancelled together and the whole-payment refund waits until none of them is still active.
2. **Refund is requested, then confirmed.** Each part is a `transaction_refund` row (`preparing` → `requested` → `processed` | `failed`, which tickets in `transaction_refund_ticket`). `refund_mark_requested` writes the part's negative `refund_hold` (tagged `refund_id`); the payment stays `successful` until its last tickets are refunded, when it moves to `refund_pending` and, once that part is confirmed, `refunded` — as a whole refund always did. The webhook matches each `refund.processed` / `refund.failed` to its part (`refund_match`: the provider's refund id, else the amount, else the only open part). A failed part gives its hold back (`refund_release`, same `refund_id`) and leaves its tickets uncovered, so the buyer sees **Retry refund** for that ticket (website and app). A whole-payment refund works as before: `record_refund_hold` → `refund_pending`; `refund.failed` returns it to `successful` with `refund_requested_at` set.
3. **Idempotent.** `issueRefundCore` checks `transaction.status` first; a repeat call on `refund_pending`/`refunded` does nothing except finish a missing credit step.
4. **Cancelling a ticket** (`cancelUserTicketCore`) releases the inventory unit and, on a cash payment, requests that ticket's refund at once while the payment's other tickets stay valid (a checked-in ticket of the same payment does not stop it). On a credit or Pay small small payment the other active tickets must go with it (`scope: "payment"`, else 409), and none can be cancelled for a refund once one was checked in. Already-cancelled tickets return success without repeating anything. The buyer sees what comes back before confirming (`ticketCancelQuoteCore`).
5. **Orphan transactions** (no linked tickets — 5 early-2026 test rows) return 400 "No tickets are linked to this payment" and are refunded manually if ever needed.
6. **Promotions are not refundable** in code (no refund path exists); a failed activation with credit captured is corrected by an audited credit adjustment.
7. **A purchase paid small small goes back through its parts.** Its transaction's provider is `abonten_plan`: `issueRefundCore` works out the ticket revenue as usual, then `ticket_plan_plan_purchase_refund` splits that cash across the parts' own charges, each asked of the provider separately. The transaction is `refunded` once every share has landed. An unfinished plan that ends (deadline, buyer, cancelled event) is refunded the same way, keeping the service-fee share of what was paid when the plan's terms say so ([architecture/ticket-plans.md](../architecture/ticket-plans.md) §5).

## Procedures

### A. Buyer cancels (self-service)

Web My Tickets / app Tickets → Cancel ticket → `cancelUserTicket` → `cancelUserTicketCore` → `issueRefundCore` (buyer context). A buyer holding several tickets for the event can choose **Cancel all for this event** instead (`cancelEventTicketsCore`): every active ticket they hold for it is cancelled and each payment refunds its share. Nothing for staff to do unless a refund fails.

### B. Organizer cancels an event

`cancelEvent` → RPC `cancel_event_and_release_tickets` (atomic: event `canceled`, tickets/attendance/checkouts cancelled, one notification per attendee) → `issueRefundCore` on the **service-role client** for each refundable transaction (`Promise.allSettled`) → cancellation emails via `after()`. The action returns `{refundsInitiated, refundsFailedToStart}`; failures show as *Refund failed* to the buyer with Retry.

**Staff check after a large cancellation:** Admin › Finance › Refunds — every transaction for the event should be `refund_pending`; Finance › Organizers › organizer shows the `refund_hold` entries. If some are still `successful`, run the admin refund on each (step C).

### C. Admin-initiated refund

Admin › Finance › Transactions › [transaction] › **Refund** (`finance.refund`, step-up, reason required) → `refundTransactionAdminCore` → `issueRefundCore` (service-role, no buyer check). Audit action `finance.refund`. Use for: support-approved refunds, retrying a failed request, fulfilling a court/regulator instruction.

### D. Refund failed

Buyer: *Retry refund*. Staff: check Paystack dashboard for the refund's status; common causes are Paystack balance too low (refunds draw on the merchant balance) or a settlement not yet available. Retry via step C once resolved.

### E. Refund confirmed by Paystack but still `refund_pending` in Abonten

The webhook did not arrive or failed. Check the webhook route errors (Sentry), replay the event from the Paystack dashboard. If replay is impossible: for a payment refunded ticket by ticket (Admin › Finance › Transactions › [transaction] lists its **Refund parts**), an engineer calls `refund_mark_outcome(refund_id, 'processed')` for the confirmed part on the service role; for a whole-payment refund, `record_refund_release` as before. Record an admin note either way.

### F. Credit-funded purchases

When a ticket was paid partly with Abonten Credit, `refundTenderSplit` splits the refund pro rata: the cash part goes to Paystack, the credit part back to the buyer's credit account via `credit_refund_redemption` (`credit_refunded_amount` on the transaction). If the credit step failed, re-running the refund (step C) completes it idempotently.

### G. Goodwill

Where Abonten's systems failed a customer, an admin with `rewards.goodwill` can grant up to GH₵ 50 per user per month of Abonten Credit (`credit_grant_goodwill`); larger amounts go through `finance.adjust` (maker-checker ≥ GH₵ 500). Cash goodwill has no tool today — use a refund (step C) if a transaction exists. Policy limits: decision F5.

### H. Pay small small plans

Refund shares the provider refused, or that may or may not have reached it, wait in Admin › Pay small small › **Refund needs staff** with an incident. Check the provider's dashboard for the part's reference before anything else: a provider accepts several partial refunds of one charge. Then **Ask the provider again** (only when the dashboard shows no refund) or **Record as refunded** (the money reached the buyer another way). Never retry a plan's purchase refund from Finance › Transactions while its shares are pending: the transaction already says `refund_pending`. Handbook: [admin/ticket-plans.md](../admin/ticket-plans.md).

## Communications

Never tell a customer a refund is "complete" until `transaction.status = refunded`. The cancellation email already says "processing". Refund timing after Paystack confirmation is the bank's or network's, not Abonten's.

## Escalation

Refunds over the organizer's outstanding balance (creating a negative balance), disputes, or anything involving a suspended organizer → founder. Suspected fraud → `../incident-response/payment-fraud-and-duplicates.md`.
