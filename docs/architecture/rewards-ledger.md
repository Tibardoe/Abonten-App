# Abonten Rewards: the credit ledger

_Phase 1 shipped 2026-09-10 (branch `feat/rewards-p1-ledger`). The owner
approved the product decisions that day: no cash withdrawals in version 1,
"Abonten Rewards" / "Abonten Credit", 1% event referral capped at 35% of net
revenue, GH₵ 3 + GH₵ 2 friend referral, 20% organizer net-revenue rebate as
promotion credit, a monthly budget of max(GH₵ 1,000, 25% of trailing net
revenue), credit purchases recorded as `transaction` rows, and Playwright /
Maestro / Android Install Referrer as approved tooling._

This is the reference and runbook for the credit ledger. The full product and
architecture plan (economics, fraud, phases) is the "Abonten Rewards
Blueprint" artifact; PROJECT.md §27 summarises what is live.

## What credit is (and isn't)

- **One account per person** (`user_info.id`), whatever their role. An
  organizer or place owner uses the same account as their customer self.
- **A promotional liability, not money owed.** Credit never touches
  `organizer_ledger_entry`, and organizer earnings never become credit.
- **Closed-loop in version 1:** non-transferable, no cash value, no withdrawals.

## Model

| Table | Role |
|---|---|
| `credit_journal` | One immutable row per business transaction. `idempotency_key` is UNIQUE and required. |
| `credit_entry` | Immutable signed lines in **pesewas** (`bigint`). Each journal's lines sum to zero (deferred constraint trigger). |
| `credit_ledger_account` | Double-entry accounts: per-user buckets `pending / available / reserved / frozen / withdrawing`, and system accounts (`reward_contingent`, `reward_expense`, `campaign_expense`, `admin_adjustments`, `breakage`, `redemption_*`, `withdrawals_payable`, `cash_disbursed`, `withdrawal_fee_income`). |
| `credit_lot` | One row per grant: what is left of it (`remaining_minor`), the part on hold (`held_minor`), what it may be spent on (`spend_scope`), expiry, and which system account funded it. |
| `credit_account` | Per-user header: status (`active/frozen/closed`) and **cached** bucket balances + lifetime totals. Only the functions below update it, in the same transaction as the entries. |

Sign convention: a positive entry credits an account. User buckets are
liabilities, so a positive entry raises the user's balance.

The ledger is the source of truth; the cached balances are a copy that
`credit_reconciliation_checks()` compares against it every 30 minutes (via
`run_financial_reconciliation`, which opens an `incident` on any drift).

Credit tables carry the user id **without a foreign key** so financial
history survives a hard account delete. `deleteAccountCore` calls
`credit_close_account` first (voids pending rewards, forfeits the balance to
breakage, marks the account closed).

## Journal types

| Type | Debit | Credit |
|---|---|---|
| `reward.accrue` | `reward_contingent` | `user:pending` |
| `reward.release` | `user:pending`, `reward_expense` | `user:available`, `reward_contingent` |
| `reward.void` | `user:pending` | funding account (`reward_contingent`) |
| `reward.clawback` | `user:available` | `reward_expense` |
| `bonus.grant` | `campaign_expense` | `user:available` |
| `adjust.credit` / `adjust.debit` | `admin_adjustments` / `user:available` | `user:available` / `admin_adjustments` |
| `expire` | `user:available` | `breakage` |
| `account.close` | `user:available` | `breakage` (or a debt written off to `admin_adjustments`) |

| `redeem.reserve` | `user:available` | `user:reserved` |
| `redeem.release` | `user:reserved` | `user:available` |
| `redeem.capture` | `user:reserved` | `redemption_promotions` (or `redemption_tickets`) |
| `redeem.refund` | `redemption_tickets` (or `redemption_promotions`) | `user:available` (new `refund` lots) |

Reserved for later phases (already in the CHECK constraint): `hold.*`,
`withdraw.*`.

## Functions (all `SECURITY DEFINER`, `search_path = ''`)

Mutating functions are executable by **`service_role` only**; the `_credit_*`
helpers by nobody but their owner. Clients can't write any credit table, and
**service_role has SELECT only** on the ledger tables, so even the backend key
can move credit only through these functions.

- `credit_grant(user, amount, journal_type, lot_kind, spend_scope, idempotency_key, …)`
- `credit_release_lot(lot, key, release_minor?)`: partial release voids the remainder
- `credit_void_lot(lot, key)`
- `credit_debit_available(user, amount, 'adjust.debit'|'reward.clawback', key, allow_negative?, preferred_lot?)`
- `credit_expire_due_lots(limit)`: pg_cron `credit-expire-lots`, daily 02:00 UTC
- `credit_set_account_status(user, 'active'|'frozen', reason, actor)`
- `credit_close_account(user)`
- `credit_request_adjustment` / `credit_execute_adjustment` / `credit_reject_adjustment`: every manual adjustment is a request; at or above `dual_approval_threshold_minor` (GH₵ 500) a **different** admin must approve it
- `credit_grant_goodwill(user, amount, admin, reason, key)`: capped per user per calendar month (`support_goodwill_monthly_cap_minor`, GH₵ 50) under the account lock
- Reads: `get_my_credit_summary()`, `get_my_credit_activity(cursor…)` (authenticated, scoped to `auth.uid()`), `get_rewards_program_public()` (anyone), `admin_rewards_overview(from, to)` and `credit_reconciliation_checks()` (service_role)

### Concurrency and idempotency

Every posting locks the user's `credit_account` row (`FOR UPDATE`), then
re-checks the idempotency key under that lock, so concurrent calls with the
same key post once and concurrent spends can't overdraw. Spending order is
the preferred lot first, then non-withdrawable, soonest-expiring, oldest.
System accounts keep no cached balance (no hot row).

### Debt

`available_minor` can go negative only through a clawback or an admin debit
with `allow_negative`. The account is then "in debt": spending and
withdrawal are blocked, and the next grant repays the debt first (the new
lot only receives what's left after repayment).

## Program settings and rules

- `reward_program_setting` (one row): `rewards_enabled`, `audience`
  (`staff` → `beta` → `all`), feature switches, thresholds. Everything ships
  off. `rewards_enabled_for_user(user)` / `get_rewards_program_public()`
  decide visibility. The deploy-level kill switch `REWARDS_KILL_SWITCH=true`
  (web env) overrides the database.
- `reward_rule`: **versioned**; rows are never edited (a trigger allows only
  `is_active` to change), and at most one version per rule is active. Seeded
  at the approved launch rates, all inactive until the engine ships.
- `reward_campaign`, `reward_budget_period`: created now, used from Phase 4.

## Spending credit at checkout (Phase 2: promotions)

A `credit_reservation` holds credit for one checkout while it is paid for:

```
quote  → credit_spendable(user, scope) + allocateCredit()   (what the switch shows)
start  → payment_attempt (amount = CASH part) → credit_reserve(…, attempt id)
         credit only: provider 'abonten_credit', amount 0 → finalized at once
paid   → finalizePaystackPayment: Paystack amount == reservation.cash_minor
         → transaction(amount = cash, credit_amount) → credit_capture_reservation
         → activate the promotion
failed / replaced / lapsed → credit_release_reservation
```

- The payment path trusts the **reservation** (written only by service-role
  functions), never `payment_attempt.credit_amount`, which its owner can edit.
  A credit-only attempt without a matching full-credit reservation is failed.
- Promotion prices come from the tier (`*_promotion_tier.price`), not the
  checkout row's `total_price`.
- Credit is captured **before** the promotion is activated, so nothing is
  activated without its credit. If the checkout lapsed first, the credit is
  released instead (a credit-only order fails; a part-credit order lands in
  `fulfillment_failed` like any late cash payment and support refunds the cash).
- A part-credit order leaves at least `min_cash_charge_minor` (GH₵ 1) for
  Paystack; otherwise credit covers the whole order or nothing.
- Spending order: credit that can't be withdrawn, then scope-restricted
  credit (promotion credit before general credit), soonest expiry, oldest.
- Switch: `reward_program_setting.redeem_promotions_enabled` (Admin › Rewards ›
  Program settings).

## Spending credit on tickets (Phase 3)

Same reservation machinery, reserved for the whole **payment group** (one
Paystack charge can cover several checkout sessions): scope `tickets`,
target `ticket_payment_group` / `payment_attempt.payment_group_id`, on the
group's primary attempt. The order total is `prepareCheckoutPayment`'s
(server-priced `ticket_checkout` rows + service fee); each attempt row stores
its own cash (`amount`) and credit (`credit_amount`) share (`apportionCredit`).

- **Who pays for it:** the organizer is still paid 100% of the ticket price
  (`record_organizer_earning` is unchanged). Credit spent on a ticket is
  Abonten's cost — already booked as an expense when the credit was granted,
  so `record_platform_fee` doesn't subtract it again: the service fee is
  `(cash + credit) − ticket revenue` and `platform_fee_entry.credit_applied`
  records the credit.
- **Limits:** `redeem_tickets_enabled`; `max_credit_share_of_ticket_order_bps`;
  `allow_full_credit_ticket_orders` (off: at least `min_cash_charge_minor`
  stays cash). `credit_spendable` returns these so the quote and the payment
  agree. Credit can't be spent on tickets to an event the buyer organizes
  (`own_event`).
- **Lapsed sessions:** if a session in the group was expired/cancelled before
  the charge is confirmed, the credit is released instead of captured.
- **Refunds** (`issueRefundCore`, used by self-cancel, organizer cancellation
  and admin refunds): the refundable ticket revenue is split pro rata to how
  the order was paid (`splitRefundTender`). The cash share goes back through
  a partial Paystack refund; the credit share through
  `credit_refund_redemption(transaction, amount)` — new `refund` lots with the
  scope/withdrawable flag of the lots used, expiring at the later of their
  expiry and 30 days out; idempotent per transaction
  (`redeem.refund:<transaction id>`), recorded on
  `transaction.credit_refunded_amount`. An order paid entirely with credit
  never touches Paystack and is `refunded` at once. The service fee is
  retained either way.
- **Event cancellation:** `cancel_event_and_release_tickets` returns orders
  paid (partly or entirely) with credit; `transaction_amount` is what the
  attendee paid in total.
- **Payout review:** a `BEFORE INSERT` trigger on `payout` flags a payout
  (`review_status = 'required'`, details in `review_details`) when one of the
  organizer's events settled in the last 180 days had more than
  `credit_share_payout_hold_bps` (20%) of its ticket revenue paid with credit.
  A flagged payout can't be completed (`payout_guard_review`, 55000) or sent
  as a Paystack transfer until an admin clears it
  (`admin_clear_payout_review`, Admin › Finance › Payouts › Clear review;
  `finance.payout` + step-up + audited). Cleared events aren't flagged again.

## Disputes

`payment_dispute` records every Paystack `charge.dispute.*` webhook event
(upsert by dispute id). A new dispute opens one `incident` for staff
follow-up. No money moves; Paystack holds the disputed amount.

## Runbook

- **Freeze an account:** Admin › Rewards › account › Freeze (`rewards.freeze`). Status only; the user keeps earning.
- **Correct a balance:** Admin › Rewards › account › Adjust credit (`finance.adjust` + step-up). Never edit the tables. Over GH₵ 500 needs a second admin.
- **Reconciliation incident:** freeze the affected accounts, compare `credit_account` with `select la.code, sum(e.amount_minor) from credit_entry e join credit_ledger_account la on la.id = e.ledger_account_id where la.owner_user_id = '<user>' group by 1`, then correct with an audited adjustment. The ledger is the truth.
- **"Credit reservations need attention" incident:** `select id, payment_attempt_id, status, expires_at from credit_reservation where status = 'reserved' and expires_at < now() - interval '2 hours'`. Check the linked `payment_attempt`: if it succeeded, capture with `credit_capture_reservation(id, transaction_id)`; if it failed or never happened, `credit_release_reservation(id, 'manual')`. Both are idempotent.
- **A paid promotion that never activated with credit captured:** give the credit back with an audited adjustment (Adjust credit). (`credit_refund_redemption` is wired for ticket refunds; promotions have no refund flow.)
- **A refund whose credit step failed** (the transaction is `refund_pending`/`refunded` but `credit_refunded_amount` is 0): run the admin refund again (or `issueRefundCore`) — it only finishes the credit step, idempotently.
- **"Held for review" payout:** Admin › Finance › Payouts shows the events and their credit share. Check the buyers aren't linked to the organizer, then Clear review with a note; otherwise mark the payout failed/cancelled (the balance returns to the organizer ledger).
- **Switch the program off in an emergency:** set `REWARDS_KILL_SWITCH=true` on the web deployment, or untick "Program switched on" in Admin › Rewards › Program settings.
- **Tests:** `packages/services/src/__integration__/credits-*.integration.test.ts` (ledger, authorization/RLS, concurrency, admin operations, promotion and ticket redemption).
