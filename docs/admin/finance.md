---
title: Admin › Finance
purpose: Map of the Finance module — what each screen shows and which procedure in docs/finance applies.
audience: finance_admin, analyst (view), super_admin
scope: /finance, /finance/transactions, /finance/transactions/[id], /finance/refunds, /finance/payouts, /finance/organizers/[id]
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: yes
---

# Admin › Finance

Source: `packages/services/src/admin/finance/financeAdminCore.ts` (reads), `financeActionsCore.ts` (writes). Procedures: `../finance/`.

| Screen | Shows | Actions |
|---|---|---|
| **Overview** (time range) | Total charged, ticket revenue, service-fee revenue, processing cost, net platform revenue (from `platform_fee_entry`); refunds count/amount; organizer money booked / held / paid / outstanding (from `organizer_ledger_entry`); pending payouts; the active fee rate | none |
| **Transactions** | Search by status, Paystack reference, email (PII), date. Detail = full trace: transaction, every payment attempt, fee entry, ledger entries, tickets, checkouts, refundable amount now | **Refund** (`finance.refund`, step-up, reason) — `../finance/refunds-and-cancellations.md` §C |
| **Refunds** | Transactions in `refund_pending` / `refunded`, charged vs refundable | none (retry via Transactions › Refund) |
| **Payouts** | Every payout with organizer, masked destination, status, review status, transfer status | **Settle…** completed / failed / cancelled (`finance.payout`, step-up); **Clear review**; (Send via Paystack — not built, flag off) — `../finance/settlement-ledger-and-payouts.md` |
| **Organizers › [id]** | Earned / held / paid-out / outstanding, payout accounts, recent ledger and payouts | **Create payout** (`finance.payout`, step-up) |

## Reading the numbers

- "Held" is the magnitude of negative `refund_hold` rows — money withheld from organizers pending refund confirmation.
- Outstanding = booked − paid out − held. It can be negative for an organizer after post-payout refunds.
- Processing cost is Paystack's fee as reported at verify time; NULL means Paystack did not report it — never assume zero.

## Before any write

Fresh step-up; read the trace; write a reason a future auditor will understand; check `../finance/reconciliation.md` daily review first if anything looks off.
