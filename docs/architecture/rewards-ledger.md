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

Reserved for later phases (already in the CHECK constraint): `redeem.*`,
`hold.*`, `withdraw.*`.

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

## Disputes

`payment_dispute` records every Paystack `charge.dispute.*` webhook event
(upsert by dispute id). A new dispute opens one `incident` for staff
follow-up. No money moves; Paystack holds the disputed amount.

## Runbook

- **Freeze an account:** Admin › Rewards › account › Freeze (`rewards.freeze`). Status only; the user keeps earning.
- **Correct a balance:** Admin › Rewards › account › Adjust credit (`finance.adjust` + step-up). Never edit the tables. Over GH₵ 500 needs a second admin.
- **Reconciliation incident:** freeze the affected accounts, compare `credit_account` with `select la.code, sum(e.amount_minor) from credit_entry e join credit_ledger_account la on la.id = e.ledger_account_id where la.owner_user_id = '<user>' group by 1`, then correct with an audited adjustment. The ledger is the truth.
- **Switch the program off in an emergency:** set `REWARDS_KILL_SWITCH=true` on the web deployment, or untick "Program switched on" in Admin › Rewards › Program settings.
- **Tests:** `packages/services/src/__integration__/credits-*.integration.test.ts` (ledger, authorization/RLS, concurrency, admin operations).
