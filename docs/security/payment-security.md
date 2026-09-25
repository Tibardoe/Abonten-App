---
title: Payment security
purpose: Document the security properties of the Paystack integration — initiation, verification, webhook handling, idempotency, ticket issuance, refunds, transfers, and the residual risks.
audience: Engineering, finance, security reviewers
scope: packages/services/src/payments, apps/web/src/app/api/paystack/webhook, money-path RPCs
status: Approved
version: 1.1
lastReviewed: 2026-09-25
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
| Test/live separation | An account whose keys mix test and live, or contradict `PAYMENTS_MODE`, is refused; a signed webhook whose `domain` is the other mode is acknowledged and ignored; the health check reports each key's mode (never the key) | `providers/keyMode.ts`, `registry.ts`, `paystackProvider.parseWebhook` |
| Lost settlements | `payment-reconcile` (*/5) verifies open charges past the checkout hold with the provider and finishes them through `finalizePayment`; never-started attempts cancelled after 1 h | `reconcilePaymentAttemptsCore.ts`, migration `20260925120000` |
| Verification | Every payment verified server-side with Paystack before any ticket is issued; amount and currency must match | `finalizePaystackPayment.ts` |
| Race safety | CAS lock on `payment_attempt` (`initiated|pending|fulfillment_failed → processing`); `transaction (provider, provider_reference)` UNIQUE; `payment_webhook_event` dedupes deliveries | same |
| Webhook | Signature verified against `PAYSTACK_WEBHOOK_SECRET`; handlers idempotent; route excluded from cookie middleware | `api/paystack/webhook/route.ts` |
| Issuance | `issue_tickets_for_checkout` authorizes a paid issuance only with a matching attempt **and** a `successful` transaction owned by the caller; free issuance only when every row is priced 0; idempotent | migration `20260907093200` |
| Client-callable fulfilment | `issueFreeCheckoutTickets` re-verifies every row is pending, caller-owned and priced 0 | `apps/web/src/actions/issueFreeCheckoutTickets.ts` |
| Refunds | Partial refund of ticket revenue via `get_transaction_refundable_amount` (service-role only); `record_refund_hold` / `record_refund_release`; idempotent on status | `issueRefundCore.ts` |
| Financial RPCs | Six `record_*` functions `service_role`-only (`20260903200000`) | migrations |
| Ledger integrity | Append-only entries; reconciliation every 30 min | `run_financial_reconciliation` |
| Disputes | `charge.dispute.*` recorded, incident opened, payout review forced | webhook, `payout_guard_review` |
| Transfers | Off per market (`market_payment_provider.payouts_enabled`, Admin › Markets); recipient/transfer creation and webhook settlement coded to Paystack docs, **unverified live**; admin action needs `finance.payout` + step-up | `paystackProvider.ts`, `sendPayoutAdminCore` |
| Admin money actions | `finance.refund` / `finance.payout` + step-up + reason + audit | `financeActionsCore.ts` |

## Residual risks

- The client-verify path runs as the buyer and calls the same finalize function as the webhook — safe by design (server verifies with Paystack), but a Paystack outage during verify leaves attempts `pending` until the reaper/retry (by design, FIN-003).
- `payment_attempt.status` is not updated on refund (informational `refunded` exists but is not driven) — known cosmetic gap.
- Paystack test vs live keys: until the switch in [../finance/paystack-live-cutover.md](../finance/paystack-live-cutover.md), production runs on the **test** keys (verified 2026-09-25 from production's own behaviour), so a Paystack test card buys a real ticket. Mixed keys and a contradicting `PAYMENTS_MODE` are now refused, and the health check shows each key's mode.
- Preview deployments share the production database; they must not hold live keys (cutover §3).
- Five orphan early-2026 transactions with no tickets exist in production (harmless; refund path refuses them).

## Verification history

Money path tested on production with real Paystack calls in **test mode** (2026-09 production audit; every production transaction verifies on the Paystack test account — no live-money transaction has been made as of 2026-09-25) and the full refund pipeline confirmed end to end (2026-09-06, six stacked bugs fixed). Integration suites: `money-path-lockdown`, `idempotency`, `concurrency`, `checkout-time-guards`.
