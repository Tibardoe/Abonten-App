---
title: Payments and ticketing runbook
purpose: Describe, function by function, how a ticket purchase moves from selection to issued ticket, and what to do at each failure point.
audience: Engineering, finance admins, support leads
scope: Paid and free ticket checkouts, promotion checkouts, Paystack popup / direct charge / mobile-money OTP, webhook, fulfilment retry
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Payments and ticketing runbook

## 1. The money path

```mermaid
sequenceDiagram
  participant C as Client (web action / mobile API)
  participant V as validateCheckoutCore
  participant DB as Postgres (RPCs)
  participant P as Paystack
  participant F as finalizePaystackPayment
  participant G as generateTicket → issue_tickets_for_checkout

  C->>V: eventId, quantities, promo code, occurrence
  V->>DB: expire_stale_ticket_checkouts(); checks; price lines
  V->>DB: create_ticket_checkout(lines) — reserves inventory, claims promo, inserts pending rows (30 min)
  C->>C: createMultiCheckoutPaymentAttemptCore → payment_attempt(initiated) → Paystack init
  C->>P: popup / charge / MoMo OTP
  P-->>C: reference
  par client verify (fast)
    C->>F: verifyPaystackPaymentCore(attemptId)
  and webhook (authoritative)
    P->>F: charge.success (signature checked)
  end
  F->>DB: CAS payment_attempt → processing
  F->>P: verify(reference)
  F->>DB: insert transaction (paystack_reference UNIQUE)
  F->>G: deps.issueTickets
  G->>DB: issue_tickets_for_checkout — tickets + attendance + checkout=paid + record_organizer_earning (one transaction)
  F->>DB: record_platform_fee(transaction, processing_cost)
  G-->>C: tickets; email via after(); notification
```

## 2. Step by step, with the source

| Step | Code | Tables | Failure handling |
|---|---|---|---|
| Validate and reserve | `packages/services/src/checkout/validateCheckoutCore.ts` → RPC `create_ticket_checkout` (`20260907094000`) | `ticket_checkout` (pending, `expires_at = now + 30 min`), `ticket_type.quantity` (single-statement CAS decrement), `promo_code_usage` | Any failure rolls the whole RPC back (INV-001/INV-002 fixed). Limits: 50 per type, 100 per order (`checkoutLimits.ts`), rate limit `checkout-validate:${userId}` 30/min. Refuses while a pending checkout or a ticket for the event exists. |
| Free RSVP | `registerForFreeEventCore.ts` → `issue_free_ticket` | `ticket`, `attendance` | One per user per event; refused after the event (or its next date) has started. |
| Payment attempt | `createMultiCheckoutPaymentAttemptCore.ts` (tickets), `createPromotionPaymentAttemptCore.ts` (promotions) → `paystackInit.ts` | `payment_attempt` (`initiated`, amount from the checkout rows, never the client) | Paystack init failure → attempt `failed`, checkout stays pending until expiry. |
| Pay | Paystack popup (`usePaystackPopup.ts`), saved-card charge, MoMo direct charge + `submitPaystackChargeOtpCore.ts` | — | MoMo may return `pending` awaiting the customer's approval. |
| Finalize | `finalizePaystackPayment.ts` — called by `verifyPaystackPaymentCore` (client) **and** `api/paystack/webhook/route.ts` | `payment_attempt` CAS `initiated|pending|fulfillment_failed → processing`; `transaction` insert | Verify network error → back to `pending` (retryable, FIN-003 fixed); Paystack terminal failed/abandoned/reversed or amount mismatch → `failed`. A `processing` row older than 15 min self-heals on the next call and via `recover_stale_payment_attempts()` (pg_cron */5). |
| Issue tickets | `apps/web/src/utils/generateTicket.ts` (QR to Cloudinary) → RPC `issue_tickets_for_checkout` (`20260907093200`) | `ticket`, `attendance`, `ticket_checkout=paid`, `organizer_ledger_entry` (`earning`, 100% of price) | Atomic; a replay returns existing tickets (`already_issued=true`). Paid issuance requires a matching `payment_attempt` and a `successful` transaction owned by the buyer. |
| Platform fee | `record_platform_fee(transaction_id, processing_cost)` from `finalizePaystackPayment` | `platform_fee_entry` (`fee` row, idempotent) | Best-effort; a failure is logged and reconciliation catches a paid checkout without a fee row indirectly through the `platform_fee_entry` totals. |
| Notify | `ticketPurchaseNotification.ts` (Resend, PDF attached), `createNotificationCore` (+ push) | `notification`, `device_token` | Best-effort; never blocks issuance. |
| Retry | `retryPaymentFulfillmentCore.ts` (web action `retryPaymentFulfillment`, mobile `POST /api/mobile/payments/retry`) | — | Re-runs finalize; idempotent end to end. The UI shows it when the attempt is `fulfillment_failed` or the checkout is paid without tickets. |

## 3. Promotions

Same shape with `insertEventPromotionCheckoutCore` / `placePromotionCore` → `event_promotion_checkout` / `place_promotion_checkout` → `createPromotionPaymentAttemptCore` → `finalizePaystackPayment` → `apps/web/src/utils/activate{Event,Place}Promotion.ts` (server-only modules) → `event_promotion` / `place_promotion` rows with `starts_at`/`ends_at` from the tier. Promotion payments have no organizer earning and no platform-fee row (they are Abonten revenue in full). Credit tender for promotions: `credit-tender-and-rewards-finance.md`.

## 4. The webhook

`apps/web/src/app/api/paystack/webhook/route.ts` — excluded from the cookie middleware matcher. Verifies the Paystack signature header against `PAYSTACK_WEBHOOK_SECRET`; handles `charge.success` (→ finalize), `refund.processed` / `refund.failed` (→ transaction `refunded` or back to `successful` with `refund_requested_at` set), `charge.dispute.*` (→ `record_payment_dispute` + incident), `transfer.success|failed|reversed` (→ `admin_settle_payout`, only when Transfers are enabled). Every handler is idempotent; a redelivered event is a no-op.

## 5. Health and automatic backstops

| Job | Schedule | What it protects |
|---|---|---|
| `expire-stale-ticket-checkouts` | */5 min | Releases seats from pending checkouts past `expires_at` **unless** a live `payment_attempt` (`initiated/pending/processing`) exists (DATA-001) |
| `recover_stale_payment_attempts()` | */5 min | `processing` > 15 min → `fulfillment_failed` (transaction exists) or `pending` (not) |
| `financial-reconciliation` → `run_financial_reconciliation()` | */30 min | Opens an `incident` for: paid checkout without earning; succeeded payment without ticket; negative inventory; attempt stuck processing > 1 h; plus credit and field-ops invariants |
| `abonten-health-check` | */2 min | Probes Paystack `/bank`, Resend, Hubtel, Cloudinary, Expo, DB/auth/storage → Admin › Monitoring |

## 6. What to do when…

- **Customer paid, no ticket** — Admin › Finance › Transactions: search the Paystack reference or email. If the transaction is `successful` and the checkout is `paid` with tickets → they are issued; resend the email or point them to My Tickets. If the attempt is `fulfillment_failed` or `processing` → have the customer press Retry, or an engineer calls `retryPaymentFulfillmentCore`; check Cloudinary (QR upload) and Sentry for the error. If Paystack shows success but no transaction row exists → the webhook or verify never ran; replay the webhook from the Paystack dashboard or call finalize with the attempt id. Never issue tickets by hand.
- **Customer charged twice** — one Paystack reference per attempt; check both references in Finance › Transactions. A second `successful` transaction for the same checkout is impossible (`already_issued` path); a second charge would be a separate attempt for a separate checkout, or a bank authorization that will drop. Refund the duplicate via Finance › Transactions › Refund (step-up).
- **Ticket type shows negative or wrong availability** — cannot happen after DATA-002 (`quantity >= 0` CHECK) and the CAS decrement; if a report suggests it, run the reconciliation check and inspect `ticket_checkout` expiry for that type.
- **Paystack is down** — health check shows Paystack down; new payments fail at init; existing pending checkouts keep their seats while an attempt is live. See `../incident-response/outages-service-email-push-third-party.md`.
- **Webhook signature failures** — Sentry/error events from the webhook route; verify `PAYSTACK_WEBHOOK_SECRET` on Vercel matches the Paystack dashboard; client-side verify continues to finalize payments meanwhile.

## 7. Verifying a fix

Integration tests: `packages/services/src/__integration__/{concurrency,idempotency,checkout-time-guards,money-path-lockdown,promo-release-scope}.integration.test.ts`. Live: a test-mode Paystack purchase end to end was last performed in the 2026-09 production audit (memory: `project_production_audit_2026-09`).
