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

## Event referrals (Phase 4)

How a share becomes credit:

1. **Code.** Each user gets one 7-character `referral_code` (no I, L, O, 0,
   1), created the first time they can share while
   `referral_capture_enabled` is on. Signed-in users' event share links carry
   it as `?ref=CODE`.
2. **Touch.** Opening such a link is logged in `referral_touch` (salted IP/UA
   hashes, 90-day retention). Web: `proxy.ts` stores the touch in the signed,
   httpOnly `abn_ref` cookie (keyed by the event slug) and
   `ReferralTouchLogger` logs it. App: `+native-intent.ts` keeps it in
   SecureStore (keyed by event id) and logs it, signed out too. For a
   signed-in visitor the latest touch per event is also kept in
   `referral_attribution` (works across devices).
3. **Stamp.** When the buyer opens a checkout, `stampCheckoutReferralCore`
   takes the web cookie / app hint plus the stored attribution, picks the
   last touch inside the window (`referral_attribution_window_days`, 7) and
   calls `stamp_checkout_referral`, which re-checks everything and stamps
   `ticket_checkout.referrer_user_id`. The stamp can't be changed afterwards.
   Refused: the buyer's own code, the event organizer's (or an organizer
   buying their own tickets), an unknown/disabled code, a stale touch, a
   restricted referrer.
4. **Evaluate.** The checkout turning `paid` queues `checkout_paid` in
   `reward_outbox` (trigger, same transaction). `rewards_process_outbox`
   (every minute) calls `_reward_evaluate_event_referral`, which writes one
   `reward_event`: amount = min(rate × ticket revenue, net-share cap × the
   checkout's share of the transaction's net revenue, what's left of the
   per-referrer event/month caps), rounded down; one rewarded checkout per
   buyer per event; minimum order. Then the risk score (below) decides
   pending / held / rejected. A live pending or held reward commits the
   monthly budget and creates a PENDING lot (`reward.accrue`); over budget →
   `deferred` (retried by the settle job, never dropped).
5. **Settle.** `rewards_settle_due` (every 15 minutes) releases pending
   rewards whose event has settled (last session end + 48h):
   `credit_release_lot` pro rata to the tickets still valid, then one
   "Your credit is ready" in-app notification per person. It voids
   refunded / cancelled / event-cancelled / removed sales and holds disputed
   or hidden ones. Live credit needs the referrer's verified phone (checked
   daily; voided after 90 days without one). Refunds, cancellations,
   moderation and disputes also queue an outbox re-check so a dead sale is
   voided straight away. A chargeback after release claws the credit back
   (`reward.clawback`, may put the account in debt).

**Risk score** (`riskScore.ts` mirrors `_reward_risk_weight`; override
weights in `reward_program_setting.risk_weights`): blocking — self referral,
organizer involved, same (normalized) email, same phone, paid with the
referrer's card/wallet; weighted — same device/install +60, buyer account
under 24h +15, referrer's sales often refunded +40, >50% of the event's sales
from this referrer +25, >20 rewards in a day +30, open dispute +80, ticket
checked in −15. Under 30 passes, 30–69 is held for review (Admin › Rewards ›
Review queue; approve = release when due, reject = void), 70+ is rejected.
Users never see flags.

**Shadow mode** (`shadow_mode`, default on): every decision is recorded with
`is_shadow = true`, but no budget, lot, journal or notification. A referrer
outside the program's audience is always evaluated in shadow. Admin ›
Rewards › Referrals shows the projection (cost as a share of referred net
revenue, flags, top referrers). Caps count shadow and live separately.

**Switching it on:** Program settings → Capture referral links (starts
stamping; links get `?ref=`), then Reward rules → Event referral → Make live
(v1 = the owner-approved 1% / 35% terms). Leave shadow mode on until the
projection has been reviewed. A new rule version is published switched off;
one that could pay more than the live one must be made live by a different
admin.

## Friend invites (Phase 5)

1. **Invite.** The inviter shares `abontenhub.com/invite/CODE` (Rewards ›
   Invite friends: link, WhatsApp, QR in the app). Web: `proxy.ts` keeps it
   in the signed `abn_ref` cookie (key `i`; a `?ref=` link to a page that
   isn't an event or place counts too, key `u`) and sets the readable
   `abn_inv` flag. App: `+native-intent.ts` keeps it in SecureStore; on
   Android the Play install referrer (`ref=CODE`) is read once per install.
   A code can also be typed on the sign-in screen or on /rewards.
2. **Bind.** After sign-in (`InviteBinder` on web, `useInviteBinding` in the
   app) the server calls `referral_bind`: capture on and the
   `friend_referral_referrer` rule live; not your own code; the account is
   under 7 days old (`bind_within_days`) and hasn't bought a ticket,
   published an event or had a place claim approved; no circle (checked 3
   levels up); the inviter isn't restricted. First bind wins, for life.
   The inviter gets an in-app "A friend joined" notification (live only).
3. **Welcome credit.** If `friend_referral_referee` is live and the friend's
   phone is verified (now, or later — `rewards_settle_due` sweeps), a
   `reward_event` is recorded and released at once: a `welcome` lot, scope
   `first_order`, 30 days. It's refused (recorded as rejected) if the
   friend has already bought, or shares the inviter's email or device.
   `first_order` credit is only offered on a ticket order of at least the
   rule's minimum (GH₵ 30) by someone with no paid ticket order that still
   stands (`_credit_first_order_eligible`), and is spent before general
   credit.
4. **Qualify.** Within 60 days of sign-up (`qualify_within_days`), the first
   of: (1) a paid ticket order of GH₵ 30+ with real cash in it; (2) an event
   the friend organizes sells paid tickets to 10 unique buyers with verified
   phones who aren't linked to them (`organizer_unique_buyers`); (3) an
   admin approves their place claim and the place is theirs. That writes a
   `friend_referral_referrer` reward_event (GH₵ 3) for the inviter —
   budget-gated, capped at 10 per inviter per month, flagged for review past
   50 lifetime, risk-scored like event referrals (plus "many friends joined
   within an hour"; a friend buying the inviter's own event's tickets is
   blocked). Pending until the event settles (path 3: 14 days after
   approval). Released in full when due and both phones are verified; a
   refund/cancellation voids it and the friend can qualify again with
   another order; an organizer-path reward is voided if the buyers are gone
   at settlement; a claim reward if the claim or place ownership changed.
5. **Shadow.** As for event referrals: with `shadow_mode` on (or the
   inviter/friend outside the audience) binds are real but rewards and
   welcome credit are recorded without posting anything.

**Switching it on:** with capture on, Reward rules → Friend invite (welcome
credit) → Make live, then Friend invite (inviter's reward) → Make live.

## Organizer and venue rebates (Phase 6)

`rewards_run_monthly_rebates(period)` — pg_cron `rewards-monthly-rebates`
at 03:00 on the 3rd for the previous month; Admin › Rewards › Rebates ›
Run a month now for any month (audited, step-up). For each event that
settled in the month (`_event_settles_at`: last end + 48 h), one decision
per rule (idempotency key `organizer_rebate:<event>` / `venue_rebate:<event>`
/ `organizer_milestone:<organizer>:<threshold>`, `:shadow` suffix in shadow):

1. **Basis** (`_reward_event_rebate_basis`): standing paid checkouts (not
   refunded, tickets still valid, no open dispute); each one's share of the
   transaction's `platform_fee_entry.net_revenue`, pro rata to valid tickets
   and to the cash part of the payment. Buyers who are an owner or share an
   owner's email, phone, device or card are excluded. Also the event's
   refund rate over all paid tickets.
2. **Organizer rebate** = floor(net × `net_share_cap_bps`) to the organizer.
   **Venue rebate** = the same at the venue rate to the owner of a
   `verified` place (`event.place_id`), only when the organizer is someone
   else. **Milestone** = `flat_minor` once, when
   `_reward_event_unique_buyers` (verified phones, unlinked) reaches
   `caps.unique_paid_attendees`.
3. **Gates** → `rejected`: event cancelled/removed, place removed, refund
   rate ≥ `max_event_refund_rate_bps`, account younger than
   `min_account_age_days` at settlement, nothing to pay. **Held**: at or
   above `dual_approval_threshold_minor` (`large_rebate`), or venue owner on
   the organizer's device.
4. **Credit**: budget-gated `promotion` lot, scope `promotions`, 180 days;
   released in the same run when the beneficiary's phone is verified (else
   `rewards_settle_due` checks daily, voids after 90 days). A venue rebate is
   voided if the place is no longer verified or changed hands before release.
5. One in-app notification per person per run; a run row in
   `reward_rebate_run` with the counts.

**Switching it on:** Reward rules → Organizer rebate / Venue rebate /
Organizer milestone → Make live. With shadow mode on, run the last month
from Rebates to see the projected cost first.

## Loyalty, promoter commissions, place visits (Phase 8)

- **Loyalty fee rebate** (`loyalty_fee_rebate`): on `checkout_paid`,
  `_reward_loyalty_evaluate` counts the buyer's standing paid orders
  (GH₵ 20+, one per event, not their own events) since their last loyalty
  reward and within 90 days; the Nth (5) gets `rate_bps` (100%) of the
  service fee the order paid in cash, max `caps.max_per_reward_minor`, as a
  budget-gated reward lot pending until the event settles
  (key `loyalty_fee_rebate:<checkout>`). Released pro rata to valid tickets
  like event referrals.
- **Promoter commission** (`promoter_commission`): needs referral capture
  and an active `event_promoter_commission` row. Amount = rate (clamped to
  `caps.min_rate_bps`–`max_rate_bps`) × `ticket_checkout.total_price`.
  **Not budget-gated** — the organizer pays: `_reward_accrue` grants the lot
  and `_promoter_commission_post` inserts `promoter_commission` (negative)
  on the organizer ledger; `_reward_void` / a partial release / a clawback
  insert `promoter_commission_reversal` (never more than was charged). The
  credit ledger itself is unchanged (the lot is an ordinary `reward` lot
  funded from `reward_contingent`); tell organizer-funded credit apart by
  `reward_event.rule_key`.
- **Place visits** (`place_visits`): `place_visit_code(place)` →
  HMAC-SHA256(secret, `place:window`) first 10 hex chars, window = 30 s; the
  current and previous window are accepted. `place_visit_record` checks the
  code, the distance (`st_distance` to `place.location` ≤ `caps.radius_m` +
  min(accuracy, 100) m), mocked location, owner, and inserts once per
  (place, user, Accra day). The monthly run (after the month is over) calls
  `_reward_place_visits_evaluate` for each verified place with visits: key
  `place_visits:<place>:<YYYY-MM>` (`:shadow` in shadow), amount =
  min(counted visitors, `caps.max_visitors_per_month`) × `flat_minor`,
  promotion lot released at once; voided if the place is no longer verified
  or changed hands.

**Switching them on:** Reward rules → Loyalty fee rebate / Promoter
commission / Place visits → Make live. Promoter commissions also need
Program settings → Capture referral links.

## Push and email for reward notices

`_reward_notify` writes the in-app notification **and** queues
`notification_delivery` rows: `push` for every notice, `email` for
`reward_available`, `welcome_credit` and `promotion_credit_earned`. The
`notification-delivery` cron job (`run_notification_delivery`, every
minute) posts to `POST /api/notifications/deliver` with the token from
`notification_delivery_config` when something is due; the route
(`@abonten/services/notifications/deliveryCore`) claims rows
(`notification_delivery_claim`), sends one Expo push / one Resend email per
person and records the outcome (`notification_delivery_finish`). Pushes wait
for 08:00–21:00 Accra; one reward email per person per 12 hours; stale
rows (push 1 day, email 7 days) are dropped; 5 failed tries = `failed`.
Switches: Program settings → Notifications (`notify_push_enabled`,
`notify_email_enabled`).

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
- **"Reward engine: outbox event(s) failed 8 times" incident:** `select id, event_type, aggregate_id, last_error from reward_outbox where dead_lettered_at is not null`. Fix the cause, then `update reward_outbox set dead_lettered_at = null, next_attempt_at = now() where id = …` — processing is idempotent (`reward_event.idempotency_key`).
- **Rewards health check down:** `select rewards_health()` — outbox lag, overdue settlements, dead letters, released rewards without a journal. Check the `rewards-process-outbox` / `rewards-settle-due` cron jobs are active.
- **A referrer abusing links or invites:** Admin › Rewards › account › Referrals › Disable code (`rewards.freeze`, audited); new touches, stamps and friend binds with it are refused and its invite page shows "not valid". Reject their held rewards in the Review queue.
- **A friend says they didn't get welcome credit:** `select * from user_referral where referee_user_id = …` and the `friend_referral_referee` reward_event for them. No row = the invite never bound (too late, not a new account, own code…). No reward_event = their phone isn't verified yet. `rejected` = they had already bought, or shared the inviter's device/email.
- **"Monthly rebates: some events failed" incident:** the run log (`select * from reward_rebate_run order by started_at desc limit 5`) has the last error. Fix the cause, then Admin › Rewards › Rebates › Run a month now for that month — decided events are skipped.
- **An organizer asks why an event earned no rebate:** Admin › Rewards › Rebates › Decisions (or `select status, status_reason, basis from reward_event where event_id = … and rule_key = 'organizer_rebate'`). No row = the event hadn't settled by the run, or no rebate rule was live.
- **An organizer asks about a promoter commission on their payout:** `select entry_type, amount, created_at from organizer_ledger_entry where ticket_checkout_id = … and entry_type like 'promoter_commission%'` and the `promoter_commission` reward_event for that checkout (Admin › Rewards › Promoters & loyalty). A deduction without a released reward is waiting (event not settled, held for review, or the promoter's phone isn't verified); a voided reward always has a matching reversal.
- **A place owner says visitors can't check in:** the code changes every 30 s — the visitor must scan the live screen, be within ~150 m with location on, and not already have checked in today (`select * from place_visit where place_id = … order by created_at desc limit 20`). The rule must be live.
- **Reward pushes or emails aren't going out:** Admin › Rewards › Program settings shows the last 7 days (sent / waiting / skipped / failed). Then `select channel, status, detail, count(*) from notification_delivery where created_at > now() - interval '1 day' group by 1, 2, 3`, `select dispatch_url, last_dispatched_at from notification_delivery_config`, and the last `net._http_response` rows. `waiting` at night is normal for pushes; `no_device` = no app install registered; `no_email` = a phone-only account; a 401 from the route means the token in the header doesn't match the config row (never copy it anywhere else). Failed rows can be retried with `update notification_delivery set status = 'queued', attempts = 0 where status = 'failed' and …`.
- **Switch the program off in an emergency:** set `REWARDS_KILL_SWITCH=true` on the web deployment, or untick "Program switched on" in Admin › Rewards › Program settings.
- **Tests:** `packages/services/src/__integration__/credits-*.integration.test.ts` (ledger, authorization/RLS, concurrency, admin operations, promotion and ticket redemption) `rewards-event-referral.integration.test.ts` (the referral engine) `rewards-friend-referral.integration.test.ts` (friend invites) and `rewards-rebates.integration.test.ts` (monthly rebates + the staff-column guards) and `rewards-p8.integration.test.ts` (loyalty, promoter commissions, place visits) and `rewards-notification-delivery.integration.test.ts` (reward pushes and emails).
