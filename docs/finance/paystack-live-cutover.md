---
title: Switching Paystack from test to live
purpose: The exact, ordered steps that move production from Paystack test mode to live mode, how each is verified without reading a secret, the one controlled live transaction to perform before paid sales open, its refund, and how to go back.
audience: Founder (holds the Paystack dashboard and Vercel), engineering
scope: Ghana's Paystack account on the web and admin deployments; preview deployments; the Paystack dashboards' webhook settings; the mobile app (no key); the integration suites
status: Approved
version: 1.1
lastReviewed: 2026-09-25
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Switching Paystack from test to live

Version 1.1 (final verification, 2026-09-25): every step below was checked
against the code as deployed; the webhook-secret wording was corrected, the
record chain for the controlled purchase and its refund is spelled out, and
the smoke script now checks production's own report of its keys.

## 1. Where things stand

Nothing here prints or stores a key. Modes were read from key prefixes
(`sk_test_` / `sk_live_`, `pk_test_` / `pk_live_`) by production itself and
reported through its health check.

| Variable | Where | Targets | Mode today | Read by |
|---|---|---|---|---|
| `PAYSTACK_SECRET_KEY` | Vercel `abonten` (web) | **Production and Preview** (one variable) | test | charges, verification, refunds (`@abonten/services/payments`, via Ghana's `market_payment_provider` row) |
| `PAYSTACK_WEBHOOK_SECRET` | Vercel `abonten` | Production | test | the webhook signature check — **it must hold the secret key itself** (§2) |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Vercel `abonten` | **Production and Preview** | test | returned to the client with each popup checkout; neither client uses it today (web resumes the popup by access code, the app opens Paystack's page) |
| `PAYSTACK_SECRET_KEY` | Vercel `abonten-app-admin` | Production | test (same account) | admin refunds and payouts |
| `PAYMENTS_MODE` | web and admin | not set | — | the mode this deployment must run in (§2) |
| any Paystack variable | EAS production / preview / development | — | **none exist** | the app never holds a Paystack key |

Evidence that production has never taken real money: all 57 production
Paystack transactions verify on the **test** account with the same amount
and currency (33 successful ↔ success, 24 refunded ↔ reversed).

**Preview deployments use the production database** (`SUPABASE_SERVICE_ROLE_KEY`
and the Supabase URL target Preview too). They sit behind Vercel's team
login (a POST to a preview API answers 401 without it), so Paystack cannot
post webhooks to them and the public cannot reach them; a signed-in team
member could still start a payment from a preview if it had Paystack keys.

## 2. What the code enforces (deployed 2026-09-25)

These are checks in `@abonten/services/payments/providers` that every
payment path shares — checkout, app verification, webhook, the reconcile
sweep and the admin console all resolve the account through the same
function, and there is no other read of a Paystack variable in the code.

- **The webhook secret is the secret key.** Paystack has no separate
  webhook secret: it signs every event with HMAC-SHA512 over the raw body
  using the account's **secret key**, and Abonten checks that signature
  against the value of `PAYSTACK_WEBHOOK_SECRET`. So that variable must hold
  **the same value as `PAYSTACK_SECRET_KEY`**. The name is historical. If
  the two differ, the account is refused outright (checkout says payments
  are unavailable) rather than silently failing every webhook.
- **No mixed keys.** Secret, public and webhook keys must all be one mode.
- **Declared mode.** With `PAYMENTS_MODE=live`, a test key — or a malformed
  key — is refused; with `PAYMENTS_MODE=test`, a live key is. With no
  declared mode, only the mixing rules apply (production today).
- **No live keys off production.** On a Vercel preview or development
  deployment (`VERCEL_ENV` ≠ `production`) a live key is refused whatever
  variables were ticked.
- **Webhook mode.** A correctly signed event whose `domain` is the other
  mode is acknowledged (200) and ignored, and logged as an error.
- **Server-side verification.** A payment counts only after the server
  verifies the reference with Paystack using its own key and the amount
  (minor units) and currency equal what the server priced; otherwise the
  attempt fails and any capture is refunded in full.
- **Payment reconcile sweep** (every 5 minutes): open charges 35 minutes to
  2 days old, and recorded charges whose ticket issuance failed, are
  verified and finished through the same `finalizePayment`; never-started
  attempts are cancelled after an hour. Each attempt gets 30 minutes
  between tries.
- **Health check** (Admin › Monitoring → `paystack`): each key's mode, the
  declared mode, the deployment, and charged payments unsettled after two
  hours.
- **Test suites** refuse a non-local database and a live key.

## 3. The cutover, in order

Prerequisite: the Paystack business is activated for live payments
(Paystack dashboard shows Live mode available with a live secret key).
Keys are pasted **only** into Vercel — never into chat, email, a ticket, a
file or a terminal.

| # | Step | Expected | Failure sign | Rollback |
|---|---|---|---|---|
| 1 | **Paystack LIVE dashboard** → Settings → API Keys & Webhooks (Live): Webhook URL `https://abontenhub.com/api/paystack/webhook`; Callback URL empty (Abonten sends its own per payment) | saved | — | clear the URL |
| 2 | **Paystack TEST dashboard** → same page: **clear** the webhook URL (or point it at a non-production URL you control) | saved | test events keep arriving at production (they are now ignored as `mode_mismatch`, but should stop) | — |
| 3 | **Vercel `abonten` → Settings → Environment Variables (Production):** `PAYSTACK_SECRET_KEY` = live secret key; `PAYSTACK_WEBHOOK_SECRET` = **the same live secret key**; `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` = live public key; add `PAYMENTS_MODE` = `live` | four variables, Production only | a value pasted with a stray space or the wrong key: step 7 refuses the account and names the variable (never the value) | put the test values back, `PAYMENTS_MODE` = `test` |
| 4 | **Vercel `abonten` (Preview):** while editing the three Paystack variables above, **untick Preview**. Add nothing for Preview. (With no keys a preview cannot start a payment; the code also refuses live keys there.) | Preview has no Paystack variables | a preview checkout shows a Paystack page | untick again |
| 5 | **Vercel `abonten-app-admin` (Production):** `PAYSTACK_SECRET_KEY` = live secret key; add `PAYMENTS_MODE` = `live` | two variables | admin refunds answer "not configured" | test values back |
| 6 | **Redeploy both projects** (Deployments → latest production → ⋯ → Redeploy). Variables reach new deployments only | both READY | build error | Vercel Instant Rollback to the previous deployment (which still has the old variables baked in) |
| 7 | **Smoke test, no charge:** `node scripts/release/production-smoke.mjs apps/web/.env.local --expect-mode live` | 40 passed: the "start a card payment" step opens a live Paystack page (nobody pays), the recorded attempt is GH/GHS with the server's charge, and the health row shows all three keys `live`, `declaredMode live`, `deployment production`, `unsettled 0`; both webhook URLs answer 401 to unsigned events | any FAIL line — read its detail; a refused account names the variable at fault | fix the variable and redeploy; nothing has been charged |
| 8 | **The controlled purchase** (§4) | one live GH₵1.05 transaction, one ticket | any mismatch in §4's table | refund (§5) and stop; do not open paid sales |
| 9 | **Record verification** (§4 queries) | every check true | — | — |
| 10 | **Refund** (§5): the buyer cancels the ticket from My Tickets | Paystack refund of GH₵1.00 requested; transaction `refund_pending`; ticket cancelled | refund refused or error | Admin › Finance › Transactions → Refund (money only; see §5) |
| 11 | **Refund verification** (§5 queries, then again after the `refund.processed` webhook) | `refunded`; ledger hold −1.00; fee retained; second request refused | — | — |
| 12 | **Final smoke:** `production-smoke.mjs --expect-mode live` again; the health row must still show `unsettled 0` | 40 passed | — | — |
| 13 | **Monitor** (§7) for the first day of sales | — | — | — |

Do not change the Paystack keys any local `.env.local` holds: development
and the sandbox suite stay on test keys, and the sandbox suite must not be
run while any Paystack dashboard's webhook points at production.

## 4. The controlled GH₵1.05 purchase

Performed by the founder with their own card or mobile-money wallet; an
engineer watches the records. Real money, smallest amount, fully refunded
in §5. If Paystack's page refuses the amount as below its minimum, use a
GH₵5 ticket (total GH₵5.25): every check below scales the same way.

**Setup.** A throwaway organizer account creates a paid event for
tomorrow: capacity 1, one ticket tier priced GH₵1, no promo code. It is
publicly listed while it exists — do it at a quiet hour, do not promote it,
delete it afterwards. Note the event code.

**Purchase.** Signed in as the founder's *own* account (not the organizer:
credit and self-purchase rules differ), buy one ticket on the website with
card or mobile money. The total shown must be **GH₵1.05** (GH₵1.00 + 5%
service fee). Complete the Paystack page. The checkout page should show the
ticket issued within seconds; My Tickets (web) and the app's Tickets tab
show it; the confirmation email arrives.

**What must exist afterwards** — one row each unless stated, all sharing
one Paystack reference `PSK-…`:

| Record | Expected values |
|---|---|
| Paystack LIVE dashboard → Transactions | 1 transaction, status success, amount **GH₵1.05**, currency GHS, reference `PSK-…`, **domain live**, channel card or mobile_money, Paystack fee shown |
| `payment_attempt` | status `succeeded`, provider `paystack`, country_code `GH`, currency `GHS`, amount `1.050`, `provider_reference` = that reference, metadata `charge_minor` **105**, `charge_currency` `GHS`, `mode` `popup`, `transaction_id` set, `paid_at`/`verified_at` set |
| `transaction` | status `successful`, provider `paystack`, same `provider_reference`, `provider_transaction_id` = Paystack's numeric id, amount `1.050`, currency `GHS`, `credit_amount` 0, `settlement_currency` `GHS`, `settlement_amount` 1.05, `provider_fee` = Paystack's fee (≈0.02) or null, reason `Ticket_Purchase`, `payment_gateway_response->>'domain'` = `live` |
| `ticket_checkout` | status `paid`, quantity 1, `total_price` 1.00, `completed_at` set |
| `ticket` | **exactly 1**, status `active`, `transaction_id` = the transaction, `ticket_code` set |
| `attendance` | 1 row, status `attending` |
| `organizer_ledger_entry` | **exactly 1** `earning`: amount **1.00**, gross 1.00, fee 0, currency GHS, `transaction_id` set (pending until 48 h after the event) |
| `platform_fee_entry` | **exactly 1** `fee`: `ticket_revenue` 1.00, `service_fee` **0.05**, `total_customer_payment` 1.05, `fee_rate` 0.05, `processing_cost` = Paystack's fee or null, currency GHS |
| `payment_webhook_event` | ≥1 row for `charge.success` with `reference` = the reference, outcome `settled`, http_status 200 (`duplicate` is fine when the app verified first) |
| Admin › Finance › Transactions | the transaction with amount GH₵1.05, event, buyer, organizer, status successful |
| `payment_orphan_capture` | **no** row for this reference |

**The equalities the test must establish**: Paystack amount (105 minor)
= `charge_minor` (105) = `transaction.amount` × 100; Paystack currency =
GHS everywhere; Paystack reference = `payment_attempt.provider_reference`
= `transaction.provider_reference` = `payment_webhook_event.reference`;
earning 1.00 + service fee 0.05 = 1.05 = amount paid; exactly one
attempt succeeded, one transaction, one ticket, one earning, one fee row.

**Read-only check** (Supabase SQL editor, replace the reference):

```sql
with t as (
  select * from public.transaction
  where provider = 'paystack' and provider_reference = 'PSK-…'
)
select
  t.status, t.amount, t.currency, t.provider_transaction_id,
  t.payment_gateway_response ->> 'domain'                                       as domain,
  (select count(*) from public.payment_attempt a
     where a.provider_reference = t.provider_reference and a.status = 'succeeded') as attempts_succeeded,
  (select a.metadata ->> 'charge_minor' from public.payment_attempt a
     where a.provider_reference = t.provider_reference and a.status = 'succeeded') as charge_minor,
  (select count(*) from public.ticket k where k.transaction_id = t.id)         as tickets,
  (select json_agg(json_build_object('type', l.entry_type, 'amount', l.amount))
     from public.organizer_ledger_entry l where l.transaction_id = t.id)        as ledger,
  (select json_agg(json_build_object('type', f.entry_type, 'revenue', f.ticket_revenue,
                                     'fee', f.service_fee, 'total', f.total_customer_payment,
                                     'cost', f.processing_cost))
     from public.platform_fee_entry f where f.transaction_id = t.id)           as fees,
  (select json_agg(json_build_object('event', w.event_name, 'outcome', w.outcome))
     from public.payment_webhook_event w
     where w.provider = 'paystack' and w.reference = t.provider_reference)     as webhooks,
  (select count(*) from public.payment_orphan_capture o
     where o.provider_reference = t.provider_reference)                        as orphan_rows
from t;
```

Expected: `successful`, `1.050`, `GHS`, a numeric id, `live`, 1, `105`, 1,
`[{"type":"earning","amount":1.00}]`, one `fee` row with 1.00 / 0.05 / 1.05,
at least one `charge.success` settled, 0 orphan rows.

## 5. The refund

**How.** Signed in as the buyer, My Tickets → the ticket → **Cancel
ticket** (web `cancelUserTicket`, app "Cancel ticket"). This is the path
customers use: it cancels the ticket and its attendance, releases the seat,
and — because it was the only ticket on the transaction — requests the
refund. (Admin › Finance › Transactions → Refund moves the money only and
leaves the ticket active; use it only if the buyer path fails.)

**Immediately** (synchronous, before Paystack confirms):

| Record | Expected |
|---|---|
| Paystack refund request | partial refund of **GH₵1.00** (100 minor) of the GH₵1.05 charge; Paystack keeps its own fee; the GH₵0.05 service fee is retained by policy |
| `transaction` | status **`refund_pending`**, `refund_requested_at` and `refund_claimed_at` set, amount unchanged 1.050 |
| `ticket` | status `cancelled`; `attendance` `cancelled`; `ticket_checkout` `cancelled`; `ticket_type.quantity` back up by 1 |
| `organizer_ledger_entry` | a second row `refund_hold` **−1.00** (earning stays; net 0 for the organizer) |
| `platform_fee_entry` | a second row `fee_refund_adjustment`: `ticket_revenue` −1.00, `service_fee` 0, `net_revenue` 0 (Abonten keeps the 0.05) |
| notification | "Refund requested" to the buyer |

**Then, asynchronously** — Paystack processes the refund (mobile money
usually within the day; cards can take several business days to reach the
bank, the webhook fires when Paystack processes it) and posts
`refund.processed` (its intermediate `refund.pending` / `refund.processing`
events are acknowledged and ignored):

| Record | Expected |
|---|---|
| `payment_webhook_event` | a `refund.processed` row with the reference, outcome `settled` |
| `transaction` | status **`refunded`** |
| notification | "Refund completed" |
| Paystack dashboard | the transaction shows a refund of GH₵1.00; status may read partially refunded |

If Paystack posts `refund.failed` instead: transaction back to `successful`
with the claim released, a `refund_release` +1.00 ledger row, and the buyer
is told; request it again from Admin › Finance.

**Idempotency.** A second Cancel on the same ticket answers 200 "cancelled"
and does nothing (compare-and-set on the ticket); a second refund request
for the transaction answers 200 "already being processed" without calling
Paystack; two requests at the same instant are serialised by
`claim_transaction_refund`; a redelivered `refund.processed` matches no
`refund_pending` row and is acknowledged as `not_refund_pending`.

**Read-only check** (run twice: after the cancel, and after the webhook):

```sql
with t as (
  select * from public.transaction
  where provider = 'paystack' and provider_reference = 'PSK-…'
)
select
  t.status, t.refund_requested_at is not null as refund_requested,
  (select json_agg(json_build_object('type', l.entry_type, 'amount', l.amount) order by l.created_at)
     from public.organizer_ledger_entry l where l.transaction_id = t.id) as ledger,
  (select sum(l.amount) from public.organizer_ledger_entry l where l.transaction_id = t.id) as organizer_net,
  (select json_agg(json_build_object('type', f.entry_type, 'revenue', f.ticket_revenue, 'fee', f.service_fee))
     from public.platform_fee_entry f where f.transaction_id = t.id) as fees,
  (select json_agg(k.status) from public.ticket k where k.transaction_id = t.id) as tickets,
  (select json_agg(json_build_object('event', w.event_name, 'outcome', w.outcome))
     from public.payment_webhook_event w
     where w.provider = 'paystack' and w.reference = t.provider_reference) as webhooks
from t;
```

Expected after the cancel: `refund_pending`, true, earning 1.00 then
refund_hold −1.00, organizer_net 0, a `fee` and a `fee_refund_adjustment`
row, tickets `["cancelled"]`. After the webhook: `refunded` and a
`refund.processed` settled delivery. Then delete the throwaway event.

## 6. Going back to test

Vercel (web and admin): set the Paystack variables back to the test values,
`PAYMENTS_MODE` = `test` (or delete it), redeploy; Paystack LIVE dashboard:
clear the webhook URL. Live payments already taken stay valid on the live
account. Refund them **through Abonten** (buyer cancel or Admin › Finance)
so the ledger follows; a refund made in the Paystack dashboard reaches
Abonten as `refund.processed` for a transaction that is still `successful`,
which is logged as "refunded outside Abonten; the ledger was not adjusted"
and must be corrected by finance.

## 7. After the switch: what to watch

- Admin › Monitoring → `paystack`: ok, modes all `live`, `unsettledPayments`
  0. Any other number is a charged payment nothing has settled for two
  hours: open Admin › Finance › Transactions and search the reference.
- Vercel `abonten` runtime errors on `/api/paystack/webhook`,
  `/api/mobile/payments/verify`, `/api/mobile/checkout/attempt` and the
  checkout pages; Sentry `abonten-web`.
- Supabase Postgres log for `mode_mismatch` (a Paystack dashboard still
  pointing test events here) and `is refused:` (a key problem).
- `payment_webhook_event`: every `charge.success` should be `settled` with
  200; `retry` rows mean a delivery was asked for again — fine once, a
  problem if they accumulate.
- `payment_orphan_capture`: a row means money was captured for a closed
  order and is being refunded; it should reach `refunded`.
- Admin › Monitoring → Incidents: the financial reconciliation opens one
  for a paid checkout without an earning, a succeeded payment without a
  ticket, or an attempt stuck processing.
- Paystack LIVE dashboard → Webhooks: deliveries should show 200; a 401
  means the webhook secret is not the secret key.

## 8. What only the live transaction proves

Whether the live Paystack business captures money and posts live webhooks
signed with the live key; Paystack's live fee on GHS charges; the refund
timing on the live rails; the buyer's bank/wallet statements. Everything
else in this document was verified in code, locally against a simulated
Paystack, and on production without a charge.
