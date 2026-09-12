---
title: Payment security
purpose: Document the security properties of the Paystack integration — initiation, verification, webhook handling, idempotency, ticket issuance, refunds, transfers, and the residual risks.
audience: Engineering, finance, security reviewers
scope: packages/services/src/payments, apps/web/src/app/api/paystack/webhook, money-path RPCs
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: yes
---

# Payment security

## Scope statement

Abonten never receives, stores or transmits full card numbers, CVVs or PINs. Card entry happens in Paystack's hosted popup or SDK; direct card charges use Paystack **authorization codes** obtained via a GHS 1.00 verification charge that is refunded immediately (`cardVerificationCore.ts`). Mobile-money numbers for saved wallets are stored as display data. Abonten holds no PCI DSS certification and does not claim one; PCI scope sits with Paystack.

## Controls along the path

| Stage | Control | Where |
|---|---|---|
| Pricing | Server-side only; client sends quantities + promo string | `validateCheckoutCore`, `@abonten/core/checkoutPricing`, `create_ticket_checkout` (price must match the quote) |
| Inventory | Single-statement CAS decrement in one transaction with the checkout insert | `create_ticket_checkout` |
| Attempt amount | Derived from checkout rows, never from the client | `createMultiCheckoutPaymentAttemptCore` |
| Secrets | `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET` server-only; `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` public by design | Vercel env |
| Verification | Every payment verified server-side with Paystack before any ticket is issued; amount and currency must match | `finalizePaystackPayment.ts` |
| Race safety | CAS lock on `payment_attempt` (`initiated|pending|fulfillment_failed → processing`); `transaction.paystack_reference` UNIQUE | same |
| Webhook | Signature verified against `PAYSTACK_WEBHOOK_SECRET`; handlers idempotent; route excluded from cookie middleware | `api/paystack/webhook/route.ts` |
| Issuance | `issue_tickets_for_checkout` authorizes a paid issuance only with a matching attempt **and** a `successful` transaction owned by the caller; free issuance only when every row is priced 0; idempotent | migration `20260907093200` |
| Client-callable fulfilment | `issueFreeCheckoutTickets` re-verifies every row is pending, caller-owned and priced 0 | `apps/web/src/actions/issueFreeCheckoutTickets.ts` |
| Refunds | Partial refund of ticket revenue via `get_transaction_refundable_amount` (service-role only); `record_refund_hold` / `record_refund_release`; idempotent on status | `issueRefundCore.ts` |
| Financial RPCs | Six `record_*` functions `service_role`-only (`20260903200000`) | migrations |
| Ledger integrity | Append-only entries; reconciliation every 30 min | `run_financial_reconciliation` |
| Disputes | `charge.dispute.*` recorded, incident opened, payout review forced | webhook, `payout_guard_review` |
| Transfers | Flag-gated off (`PAYSTACK_TRANSFERS_ENABLED`); recipient/transfer creation and webhook settlement coded to Paystack docs, **unverified live**; admin action needs `finance.payout` + step-up | `paystackTransfer.ts`, `sendPayoutAdminCore` |
| Admin money actions | `finance.refund` / `finance.payout` + step-up + reason + audit | `financeActionsCore.ts` |

## Residual risks

- The client-verify path runs as the buyer and calls the same finalize function as the webhook — safe by design (server verifies with Paystack), but a Paystack outage during verify leaves attempts `pending` until the reaper/retry (by design, FIN-003).
- `payment_attempt.status` is not updated on refund (informational `refunded` exists but is not driven) — known cosmetic gap.
- Paystack test vs live keys: an env mix-up would produce test transactions in production; the health probe uses the configured key against `/bank`, which does not distinguish modes. Check the dashboard after any key rotation.
- Five orphan early-2026 transactions with no tickets exist in production (harmless; refund path refuses them).

## Verification history

Live money path tested with a real Paystack purchase (2026-09 production audit) and the full refund pipeline confirmed end to end (2026-09-06, six stacked bugs fixed). Integration suites: `money-path-lockdown`, `idempotency`, `concurrency`, `checkout-time-guards`.
