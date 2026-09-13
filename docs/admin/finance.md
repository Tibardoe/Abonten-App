---
title: Admin › Finance
purpose: Map of the Finance module — what each screen shows and which procedure in docs/finance applies.
audience: finance_admin, analyst (view), super_admin
scope: /finance, /finance/transactions, /finance/transactions/[id], /finance/refunds, /finance/payouts, /finance/organizers/[id]
status: Approved
version: 1.1
lastReviewed: 2026-09-13
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: yes
---

# Admin › Finance

Source: `packages/services/src/admin/finance/financeAdminCore.ts` (reads), `financeActionsCore.ts` (writes). Procedures: `../finance/`.

| Screen | Shows | Actions |
|---|---|---|
| **Overview** (time range) | Customer payments in the range — total charged, ticket revenue, service-fee revenue, net platform revenue (`platform_fee_entry` rows of type `fee`, before refunds); refunds awaiting action (right now) and refunds issued in the range; organizer money all-time — earnings booked, refunds deducted, paid out, still owed (`organizer_ledger_entry`); payouts in flight; the active fee rate | none |
| **Transactions** | Search by status, Paystack reference, email (PII), date. Detail = full trace: transaction, every payment attempt, fee entry, ledger entries, tickets, checkouts, refundable amount now | **Refund** (`finance.refund`, step-up, reason) — `../finance/refunds-and-cancellations.md` §C |
| **Refunds** | Transactions in `refund_pending` / `refunded`, charged vs refundable | none (retry via Transactions › Refund) |
| **Payouts** | Every payout with organizer, masked destination, status, review status, transfer status | **Settle…** completed / failed / cancelled (`finance.payout`, step-up); **Clear review**; (Send via Paystack — not built, flag off) — `../finance/settlement-ledger-and-payouts.md` |
| **Organizers › [id]** | Earned / held / paid-out / outstanding, payout accounts, recent ledger and payouts | **Create payout** (`finance.payout`, step-up) |

## Reading the numbers

- "Refunds deducted" is the magnitude of negative `refund_hold` rows. The deduction happens the moment a refund is requested and is reversed only if the refund fails (`refund_release`), so a confirmed refund stays deducted — it is not "money held pending confirmation".
- "Earnings booked" is ticket sales before refunds; "still owed" = booked − refunds deducted − paid out. It can be negative for an organizer whose refunds were confirmed after a payout, and the console shows that rather than hiding it at zero.
- Not everything still owed is payable today: earnings become available 48 hours after the event ends (`is_event_settled`). The organizer's own Finances page splits pending from available.
- "Gross ticket sales" and "Total charged" are before refunds (`platform_fee_entry` rows of type `fee`). "Refunds issued" counts the `fee_refund_adjustment` mirror rows and reports the cash sent back — ticket price only, since the service fee is retained.
- Processing cost is Paystack's fee as reported at verify time; NULL means Paystack did not report it — never assume zero.

## Before any write

Fresh step-up; read the trace; write a reason a future auditor will understand; check `../finance/reconciliation.md` daily review first if anything looks off.
