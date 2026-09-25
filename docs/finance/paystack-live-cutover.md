---
title: Switching Paystack from test to live
purpose: The exact, ordered steps that move production from Paystack test mode to live mode, how each is verified without reading a secret, the one controlled live transaction to perform before paid sales open, and how to go back.
audience: Founder (holds the Paystack dashboard and Vercel), engineering
scope: Ghana's Paystack account on the web and admin deployments; preview deployments; the Paystack dashboards' webhook settings; the mobile app (no key); the integration suites
status: Approved
version: 1.0
lastReviewed: 2026-09-25
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Switching Paystack from test to live

## 1. Where things stand (audited 2026-09-25)

Nothing below prints or stores a key; modes were read from key prefixes
(`sk_test_` / `sk_live_`, `pk_test_` / `pk_live_`) by production itself.

| Variable | Where | Targets | Mode today | Read by |
|---|---|---|---|---|
| `PAYSTACK_SECRET_KEY` | Vercel `abonten` (web) | **Production and Preview** (one variable) | test | charges, verification, refunds (`@abonten/services/payments`, via Ghana's `market_payment_provider` row) |
| `PAYSTACK_WEBHOOK_SECRET` | Vercel `abonten` | Production | test (Paystack signs webhooks with the secret key, so it must equal it) | `POST /api/paystack/webhook` signature check |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Vercel `abonten` | **Production and Preview** | test | returned to the browser with each popup checkout (never bundled; resolved by name on the server) |
| `PAYSTACK_SECRET_KEY` | Vercel `abonten-app-admin` | Production | test (same account: every production reference verifies on the test account) | admin refunds and payouts |
| `PAYMENTS_MODE` | — | not set | — | new: the mode this deployment must run in (§3) |
| any Paystack variable | EAS production / preview / development | — | **none exist** | the app never holds a Paystack key: the server starts the charge and the app opens Paystack's hosted page (`authorization_url`) |

Evidence that production has never taken real money: all 57 production
Paystack transactions verify on the **test** account with the same amount
and currency (33 successful ↔ success, 24 refunded ↔ reversed). Production
has also accepted test-environment webhooks from local sandbox runs,
because its webhook secret is the test key.

**Preview deployments use the production database** (`SUPABASE_SERVICE_ROLE_KEY`
and the Supabase URL target Preview too). They sit behind Vercel's team
login, but whatever Paystack keys Preview has, a preview build can create
real tickets in production.

## 2. What the code now guarantees

- **No mixed keys.** An account whose secret key, public key and webhook
  secret are not all one mode is refused: checkout says the provider is not
  configured and the webhook answers 500 (Paystack retries). A half-done
  switch stops payments instead of charging on one account and verifying on
  another.
- **Declared mode.** With `PAYMENTS_MODE=live`, a test secret key is refused
  (and the reverse). Production can no longer quietly run on test keys once
  this is set.
- **Webhook mode.** A correctly signed event whose `domain` is the other mode
  is acknowledged and ignored — even if an old webhook secret was left
  behind. Nothing is changed by it.
- **Server-side verification.** Every payment is verified with Paystack
  using the server's key; the verified reference, amount (minor units) and
  currency must equal what the server priced, or the attempt fails and any
  capture is refunded. A test-mode reference cannot be verified with a live
  key at all.
- **Payment reconcile sweep.** Every 5 minutes, open charges past the
  35-minute checkout hold (under two days old) are verified with Paystack
  and finished — fulfilled, failed, or refunded — through the same
  `finalizePayment` as the app and the webhook. A charge whose app and
  webhook were both lost is no longer stranded. Never-started attempts are
  cancelled after an hour so they stop holding tickets.
- **Health check** (Admin › Monitoring, `paystack`) shows each key's mode,
  the declared mode, and any charged payment still unsettled after two
  hours.
- **Test suites** refuse to start unless the database is on this machine,
  and refuse a live Paystack key.

## 3. The switch (founder, in this order)

Prerequisite: the Paystack business is activated for live payments
(Paystack dashboard, top-right switch shows Live available).

1. **Paystack LIVE dashboard** → Settings → API Keys & Webhooks (Live):
   - Webhook URL: `https://abontenhub.com/api/paystack/webhook`
   - Callback URL: leave empty (Abonten sends its own per payment).
   - Copy the live secret key and live public key (paste them only into
     Vercel; never into chat, email, a ticket or a file).
2. **Paystack TEST dashboard** → same page: set the webhook URL to **empty**
   (or a non-production URL). Test events must never reach production.
3. **Vercel `abonten` → Settings → Environment Variables:**
   - `PAYSTACK_SECRET_KEY`: edit, untick **Preview**, set the live secret key
     (Production only).
   - `PAYSTACK_WEBHOOK_SECRET`: set to the **same live secret key**.
   - `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`: edit, untick **Preview**, set the
     live public key.
   - Add `PAYMENTS_MODE` = `live`, Production only (not a secret).
   - Preview: add nothing. Previews then cannot take payments, which is
     correct while they share the production database.
4. **Vercel `abonten-app-admin`:** `PAYSTACK_SECRET_KEY` → the live secret
   key; add `PAYMENTS_MODE` = `live` (Production).
5. **Redeploy both projects** (Deployments → latest production → ⋯ →
   Redeploy). Variables apply to new deployments only.
6. **EAS: nothing.** No mobile build or update is needed.

Do not change the Paystack keys any local `.env.local` holds: development
and the sandbox suite stay on test keys.

## 4. Verify the switch (no charge)

1. `node scripts/release/production-smoke.mjs apps/web/.env.local --expect-mode live`
   — the step "start a card payment" opens a real Paystack checkout page
   (nobody pays it) and must report `public key live; secret key not test`.
   Every other step must pass.
2. Admin › Monitoring → `paystack`: ok, `modes.GH` all `live`,
   `declaredMode` `live`.
3. Supabase Postgres/Vercel logs: no `mode_mismatch`, no
   `is refused: keys mix test and live`.

If anything fails: go back (§6); nothing has been charged.

## 5. The one controlled live transaction (before opening paid sales)

Performed by the founder with their own card or mobile-money wallet; the
engineer watches the records. Real money, smallest amount, fully refunded.

1. A throwaway organizer account creates a paid event (tomorrow, capacity
   1, one ticket tier at GH₵1). It is publicly listed while it exists, so do
   it at a quiet hour, do not promote it, and delete it afterwards.
2. The founder buys one ticket on the website (card or MoMo). Total:
   GH₵1.05 (5% service fee).
3. Check, and record in the release report:
   - Paystack LIVE dashboard: one successful transaction, GH₵1.05, domain live;
   - `payment_attempt` succeeded; `transaction` GH₵1.05 GHS with the same
     `provider_reference`; `payment_webhook_event` row with that reference,
     outcome settled; one `ticket` active; `organizer_ledger_entry` earning
     GH₵1.00 (pending); `platform_fee_entry` fee GH₵0.05 plus Paystack's fee;
   - the ticket in My Tickets on web and in the app; the confirmation email;
   - Admin › Finance › Transactions: amount, currency, event, buyer, organizer.
4. Refund it from Admin › Finance › Refunds (or the organizer's refund
   action). Expected: Paystack
   partial refund of GH₵1.00 (the fee is kept by policy); transaction
   `refunded` after the `refund.processed` webhook; ticket cancelled; the
   earning reversed by a refund-hold entry; a second refund request refused.
5. Delete the throwaway event.

Until this has been done and recorded, live payments are **not verified**.

## 6. Going back to test

Vercel: set the three variables back to the test keys (Production and, if
wanted, Preview), set `PAYMENTS_MODE=test` (or delete it), redeploy; Paystack
LIVE dashboard: clear the webhook URL. Live payments already taken stay valid
and are refunded from the Paystack LIVE dashboard if needed — the test key
cannot see them.

## 7. After the switch

- Never run `paystack-sandbox.integration.test.ts` with its webhooks pointed
  at production (§3 step 2 prevents it; the suite itself only uses the local
  database).
- Reconciliation questions: see [reconciliation.md](reconciliation.md) §
  "Provider ↔ Abonten, by reference".
