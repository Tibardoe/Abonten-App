---
title: Finance operations
purpose: Entry point for everything about money on Abonten — how a payment becomes a ticket, how refunds and payouts move, and how the books are checked.
audience: Finance admins, operations, engineering
scope: Ticket payments, promotions, refunds, organizer settlement and payouts, platform fee, credit tender, disputes, reconciliation
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: yes
---

# Finance operations

| Document | What it answers |
|---|---|
| [payments-and-ticketing-runbook.md](payments-and-ticketing-runbook.md) | The money path step by step, with the exact functions, tables and idempotency points |
| [state-machines.md](state-machines.md) | Every status a checkout, payment attempt, transaction, ticket, payout or reservation can be in, and what moves it |
| [refunds-and-cancellations.md](refunds-and-cancellations.md) | Buyer cancellation, organizer cancellation, admin refunds, fee retention, the credit split |
| [settlement-ledger-and-payouts.md](settlement-ledger-and-payouts.md) | Organizer earnings, 48-hour settlement, payout requests, admin settle/create/send, holds for review |
| [reconciliation.md](reconciliation.md) | The automated reconciliation checks, what an incident means, and the manual checks |
| [disputes-and-chargebacks.md](disputes-and-chargebacks.md) | Paystack disputes, what the system records, what staff do |
| [credit-tender-and-rewards-finance.md](credit-tender-and-rewards-finance.md) | How Abonten Credit is reserved, captured and refunded, and why it is never organizer money |

## The four principles

1. **Prices are decided on the server.** The client sends quantities and a promo-code string; `validateCheckoutCore` prices the order (`@abonten/core/checkoutPricing`) and the RPC `create_ticket_checkout` reserves inventory at that price. A client-supplied amount is never trusted.
2. **Money tables are server-write-only.** `transaction`, `payment_attempt`, `ticket_checkout`, `*_promotion_checkout`, `*_promotion`, `promo_code_usage`, `subscription*` have no client INSERT/UPDATE/DELETE (policies dropped and grants revoked, migration `20260910230109`). Writes happen from `@abonten/services` on the service-role client after ownership has been proven.
3. **Every posting is idempotent.** `transaction.paystack_reference` is UNIQUE; `payment_attempt` moves through a CAS lock; `issue_tickets_for_checkout` returns existing tickets if the checkout is already paid; `issueRefundCore` checks `transaction.status` before acting; credit postings carry an idempotency key.
4. **Ledgers are append-only.** `organizer_ledger_entry`, `platform_fee_entry`, `credit_journal`/`credit_entry`, `fieldops_commission_event` and `admin_audit_log` are never edited; corrections are new rows.

## Who can do what

| Action | Permission | Step-up | Audit action |
|---|---|---|---|
| View finance overview, transactions, refunds, payouts | `finance.view` / `transactions.view` | no | — |
| Refund a transaction | `finance.refund` | yes | `finance.refund` |
| Settle a payout (completed / failed / cancelled) | `finance.payout` | yes | `finance.payout.settle` |
| Create a payout on an organizer's behalf | `finance.payout` | yes | `finance.payout.create` |
| Send a payout via Paystack Transfers (flag off) | `finance.payout` | yes | `finance.payout.send` |
| Clear a "held for review" payout | `finance.payout` | yes | `finance.payout.review_clear` |
| Adjust Abonten Credit | `finance.adjust` | yes | `rewards.adjustment.*` |
| See payer email/phone, payout account numbers | `users.view_pii` | no | — |

Roles: `finance_admin` holds all finance permissions; `super_admin` everything; `operations` and `support_admin` can view transactions but not move money.

## Currency and rounding

All amounts are GHS. Ticket prices and fees are stored as numeric amounts in cedis on the ledger tables; Abonten Credit is stored in **pesewas** (integer minor units). The service fee is `round(price × rate)` per checkout line; the rate comes from `platform_fee_config` (`get_active_platform_fee_rate()`), seeded at 5%.

## Open decisions

Payout cadence (F1), Paystack Transfers switch-on (F2), minimum payout (F3), goodwill policy (F5), reconciliation cadence (F6), dispute procedure (F7) — see `../OPERATIONAL_DECISIONS_REQUIRED.md`.
