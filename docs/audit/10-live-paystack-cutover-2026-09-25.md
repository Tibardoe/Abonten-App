---
title: Live Paystack cutover and paid-sales gate — 2026-09-25
purpose: Record the audit of production's Paystack configuration, the safety changes made before real money, what was and was not verified, and what remains before paid sales open.
audience: Founder, engineering
scope: Paystack configuration (Vercel web and admin, EAS, Paystack dashboards), the payment path from checkout to ledger, webhooks, refunds, reconciliation, abandoned payments, test-suite safety
status: Approved
version: 1.0
lastReviewed: 2026-09-25
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Live Paystack cutover and paid-sales gate — 2026-09-25

**Gate: NOT YET READY FOR REAL PAID SALES.** The code is ready for live
keys; the live keys themselves, the Paystack dashboard webhooks and one
controlled live transaction are the founder's steps
([../finance/paystack-live-cutover.md](../finance/paystack-live-cutover.md)).
No secret was read, printed or stored in this work: every mode below was
read from a key's prefix by production itself, or from where Paystack
recorded a reference.

## 1. Configuration found

| Variable | Project / environment | Mode | Consumed by |
|---|---|---|---|
| `PAYSTACK_SECRET_KEY` | Vercel `abonten`, **Production + Preview** (one variable) | test | charge, verify, refund (Ghana's `market_payment_provider` row names it) |
| `PAYSTACK_WEBHOOK_SECRET` | Vercel `abonten`, Production | test | webhook HMAC (Paystack signs with the secret key) |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Vercel `abonten`, **Production + Preview** | test | returned per popup checkout (server-resolved; not in any bundle) |
| `PAYSTACK_SECRET_KEY` | Vercel `abonten-app-admin`, Production | test | admin refunds / payouts |
| Paystack variables | EAS production / preview / development | none exist | — the app opens Paystack's hosted page |
| Other markets (NG, KE, ZA, CI, GB, US, FR, DE) | not set | — | rows are draft and disabled |

How the modes were established:

- Production's own answer: the smoke script started a card payment (Paystack
  checkout page opened, nothing charged). The returned public key is
  `pk_test_…`, and the new reference exists on the Paystack **test** account
  — so production's secret key is the test key.
- All 57 production Paystack transactions verify on the test account with
  the same amount and currency and a matching state (33 successful ↔
  success, 24 refunded ↔ reversed). **No live-money transaction has ever
  been made.**
- All 99 production payment attempts used server-side charges; the public
  key has never been handed to a buyer.

Separation problems found:

1. The secret and public keys are single variables targeting Production
   **and Preview**; previews also target the production database and
   service-role key. Switching the shared variable to live would give every
   branch preview live keys against the production database. Previews are
   behind Vercel's team login (verified: 302 to Vercel SSO, API 401), which
   limits who, not what.
2. The Paystack **test** dashboard's webhook URL is production: production
   accepted test-environment webhooks from local sandbox runs.
3. Nothing in the code knew test from live: no check that keys agree, no
   declared mode, no look at a webhook's `domain`.
4. Report 09 said the EAS production environment needs
   `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY`. Wrong: the app has no Paystack key and
   needs no build for the switch (report corrected).

## 2. Fixes made

| # | Problem | Change | Proof |
|---|---|---|---|
| C1 | Keys of different modes could be used together; production could fall back to test keys silently | `keyMode.ts`: an account whose secret, public and webhook keys are not one mode is refused; `PAYMENTS_MODE` (`live`/`test`) refuses a key of the other mode; readiness shows the reason | unit tests; integration "PAYMENTS_MODE=live refuses test keys; live keys work", "a test-mode webhook cannot settle a payment on a live account" |
| C2 | A signed test-mode event could act on production | `parseWebhook`: `data.domain` of the other mode → acknowledged, ignored, logged as an error | unit + integration (live key, `domain: test` → `ignored: mode_mismatch`, attempt untouched; `domain: live` settles) |
| C3 | A charge whose app verify and webhook were both lost stayed `initiated` for ever — buyer charged, no ticket (production held two such test-mode charges from August) | `payment-reconcile` sweep: every 5 min, open charges 35 min–2 days old go through `finalizePayment` (verify → fulfil / fail / refund) | integration "before the sweep, a lost charge stays open and holds its tickets; the sweep settles it once"; sweep + concurrent webhook → one ticket, one transaction |
| C4 | An abandoned or never-started payment held its tickets indefinitely (`expire_stale_ticket_checkouts` skips a checkout with an open attempt; the order cannot be cancelled while a payment is open) | the sweep fails abandoned charges; `run_payment_reconcile_dispatch` cancels attempts that never reached Paystack after 1 h (not a charged group's other members) | integration: abandoned → failed → stock back; never-started → cancelled → stock back; group members kept; a buyer inside the hold untouched; a pending approval left open |
| C5 | A webhook delivery could not be tied to its payment | `payment_webhook_event.reference` | integration (live settlement logged with its reference) |
| C6 | Integration suites would write to any database the shell pointed at, and accept a live key | `vitest.setup.ts` refuses a non-loopback Supabase URL and an `sk_live_` key | run with a hosted URL and with a live-shaped key: both stop before any connection |
| C7 | Health check could not tell modes apart | `paystack` row: per-key modes, declared mode, deployment, unsettled charges > 2 h | code + typecheck (visible in production after deploy) |
| C8 | The smoke script could not check payments | `production-smoke.mjs --expect-mode live|test` starts a card payment (no charge) and checks both keys' mode | run on production: "public key test; secret key test; expected test" |

Migration `20260925120000_payment_reconcile_sweep` (additive: new table,
function, cron job, nullable column; compatible with the code before and
after). Rollout order: migration, then code (the sweep's route answers 404
until the code is live; the cron only posts when there is work).

## 3. Payment path review (section 4 / 18 of the brief)

Source of truth at each step, from code read for this review (and the
existing suites that exercise it):

| Step | Authority and checks |
|---|---|
| Ticket selection → checkout | `validateCheckoutCore` → `create_ticket_checkout` (service role): server prices every row; client sends quantities and a promo string only; stock decremented atomically with the checkout insert; capacity rule under an advisory lock |
| Payment attempt | `createMultiCheckoutPaymentAttemptCore`: amount from checkout rows (plus credit reservation), currency from the listing; caller must own the sessions; one open attempt per checkout |
| Initialization | `chargeInit`: reference `PSK-<uuid>` claimed once (`provider_reference` set only where null); provider called after the claim |
| Return / verify | `verifyPaymentCore` (buyer's session) → `finalizePayment` |
| Webhook | HMAC-SHA512 over the raw body with the account's secret (constant-time); mode check (C2); delivery log dedupe; then `finalizePayment` by reference — the payload is never trusted for payment state |
| Finalize | CAS `initiated/pending/fulfillment_failed → processing`; Paystack verify with the server key; reference, amount (minor units) and currency must equal the attempt's (or the credit reservation's cash part); mismatch → failed and refund; pending → back to pending; verify error → pending (never a decline) |
| Ticket | `issue_tickets_for_checkout` (service role) requires a matching attempt and a `successful` transaction owned by the buyer; idempotent |
| Ledger and fee | `record_*` RPCs (service role only): organizer earning = ticket price (pending, settles 48 h after the event), `platform_fee_entry` = fee + Paystack's fee; production example: GH₵157.50 → 3 tickets, earnings 50 + 100, fee row 150 + 7.50 |
| Refund | `issueRefundCore`: partial refund of ticket revenue (fee kept), refund hold, `refund.processed` webhook moves `refund_pending → refunded` once; a second request is refused |
| Late or closed | a capture on a failed/cancelled/closed attempt is recorded in `payment_orphan_capture` and refunded in full |

Client-supplied amount, currency, price, quantity-to-price, ownership and
payment status are never trusted.

## 4. Abandoned payments (the four `initiated` attempts)

| Attempt | Created | Reference | Paystack (test) | Linked checkout | Effect |
|---|---|---|---|---|---|
| 8399… | 18 Aug | none | — | none (card check) | none |
| 5de9… | 23 Aug | PSK-830d… | failed | row deleted | none |
| 6e40… | 24 Aug | PSK-fa58… | **success** (test) | row deleted | test money only |
| 3e92… | 24 Aug | PSK-6a99… | **success** (test) | cancelled | test money only |

They hold no tickets (their checkouts are gone or cancelled), carry no
revenue (no transaction) and cannot be completed by the live key (a test
reference does not exist on the live account; verify would answer "not
found", which is treated as pending, not success). They are older than the
sweep's two-day window and were **left unchanged**. The reconciliation also
found 8 more August test-mode captures with no transaction (2 cancelled, 5
failed, 1 second charge on a succeeded attempt) — all test money, all
before orphan-capture refunds existed (September).

The architectural cause (C3/C4) is fixed for everything after the
deployment.

## 5. Verified

**Production (read-only or no-charge):** configuration audit above; key
modes from production's behaviour; every production transaction reconciled
against Paystack (test); the smoke script (33 checks) including a real
Paystack checkout page opened by production and cancelled — no charge; the
latest ticket purchase's full chain (attempt → transaction → tickets →
earnings → fee).

**Local (Docker stack replayed from every migration, Paystack simulated):**
full integration suite 85 files, 723 passed, 1 skipped (the Paystack
sandbox file, which needs a test key); new `payment-live-cutover` suite 9/9
(including each fix reproduced against the old behaviour first where it
could be); `payment-gate` + `payment-attempt-reuse` 14/14 (race scenarios
of section 15: double tap, two tabs, stale checkout, duplicate
initialization, timeout, delayed / duplicate / late webhook, sold out,
concurrent buyers; refund retry is covered by `refund-claim-and-reminders`
and `global-hardening`, all in the full run); core unit 733, services unit 147;
typecheck 11/11; mobile API parity 222; docs check OK; web production
build OK (new route `/api/maintenance/payment-reconcile`).

**Paystack test mode (earlier today, not rerun):** purchase, fulfilment,
partial refund through Paystack's API, signed `refund.processed`, idempotent
second refund (`paystack-sandbox.integration.test.ts`). Not rerun because
the test dashboard's webhooks still point at production.

## 6. Not verified

- **A live-money transaction.** None has ever been made. Required before
  paid sales: cutover §5 (one GH₵1.05 purchase with the founder's own card
  or wallet, then a refund).
- The live webhook (URL, signature with the live key) — only after the keys
  are switched.
- Paystack business live-activation status (not visible with a test key).
- Race scenarios against real Paystack; they run against the simulated
  provider (double tap, two tabs, stale checkout, duplicate initialization,
  timeout, delayed/duplicate/late webhook, sold out, concurrent buyers,
  refund retry — `payment-gate`, `payment-attempt-reuse`, `concurrency`,
  `idempotency`, `refund-claim-and-reminders`, `global-hardening` suites).
- The health check's new fields in production (visible after deploy).

## 7. Remaining before paid sales (founder)

1. Paystack LIVE: webhook `https://abontenhub.com/api/paystack/webhook`.
2. Paystack TEST: clear the webhook URL (stop test events reaching production).
3. Vercel web: live secret key and public key on **Production only**
   (untick Preview), webhook secret = live secret key, `PAYMENTS_MODE=live`.
   Vercel admin: live secret key, `PAYMENTS_MODE=live`. Redeploy both.
4. `production-smoke.mjs --expect-mode live` must pass.
5. The controlled GH₵1.05 live purchase and refund, recorded.

Only after 5 can the gate read READY FOR REAL PAID SALES.

## 8. Deployment record (2026-09-25, UTC)

| Time | Step | Result |
|---|---|---|
| 21:05 | Migration `20260925120000_payment_reconcile_sweep` via the Supabase MCP (additive; before the code) | applied: target URL `https://abontenhub.com/api/maintenance/payment-reconcile`, 64-character token, RLS on, no client grants, function executable by the service role only; the four August attempts unchanged |
| 21:06 | Security advisors | only the expected INFO "RLS enabled, no policy" for the new service-only table; warning counts unchanged (24 / 66) |
| 21:07 | `feat/live-paystack-cutover-safety` merged into `main` (`fed46f8f`) | web READY 21:13, admin READY 21:15 |
| 21:15 | `POST /api/maintenance/payment-reconcile` without / with a wrong token | 401 / 401 |
| 21:16 | Health check `paystack` (production, first run on the new code) | ok; modes GH: secret test, public test, webhook test; declared mode none; unsettled payments 0 |
| 21:18 | `production-smoke.mjs --expect-mode test` | 33 passed, 0 failed; card payment started (hosted Paystack page, nothing charged), public key test, secret key test; cancel refused while the payment is open (409); every test row removed |
| 21:19 | Runtime errors since the deploy | web: only Resend refusing the throwaway `@example.com` buyers' emails (expected); admin: none |

Production still runs the Paystack **test** keys; the live switch (§7) is
the founder's.
