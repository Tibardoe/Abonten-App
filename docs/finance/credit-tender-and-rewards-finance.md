---
title: Credit tender and rewards finance
purpose: Explain how Abonten Credit is used as a tender at checkout, how it is reserved, captured, released and refunded, and why it never appears in the organizer ledger.
audience: Finance admins, engineering
scope: credit_reservation, credit_journal/entry, ticket and promotion credit redemption, rebates, promoter commissions, goodwill and adjustments
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Credit tender and rewards finance

> Production state (2026-09-12): every reward rule is in **shadow mode** and programme visibility is `staff`. Decisions are recorded, no credit is posted to the public, and no credit tender is being used by customers. Everything below is how the code behaves when switched on.

## Credit is a promotional liability, not cash

- Stored in **pesewas** in a double-entry ledger: `credit_journal` (one per posting, UNIQUE idempotency key) → `credit_entry` rows that sum to zero (deferred trigger); `credit_lot` per grant (remaining, expiry, **scope**: general or `promotions`); `credit_account` caches balances.
- Moves **only** through `SECURITY DEFINER credit_*` functions executable by `service_role`. `service_role` itself has only SELECT on the ledger tables; clients cannot write them.
- **Never** organizer money: `organizer_ledger_entry` never carries credit. (Its `promoter_commission` rows are the organizer's *cash* being charged for a promoter's reward.)
- No cash withdrawal exists in version 1.

## Tender at checkout

1. Quote: `promotionCreditCore` / `ticketCreditCore` compute how much credit can apply (`creditAllocation.apportionCredit`; promotions accept `promotions`-scoped lots; tickets only general-scope lots; a minimum cash charge may apply per `reward_program_setting`).
2. Reserve: `credit_reserve` creates a `credit_reservation` (`reserved`, with `expires_at`) linked to the `payment_attempt`; the cash part goes to Paystack. `transaction.amount` is always the **cash** part; `transaction.credit_amount` the credit.
3. Capture: on confirmed payment `credit_capture_reservation(reservation, transaction)` debits the lots.
4. Release: on failure, cancellation or expiry `credit_release_reservation` / `credit_release_stale_reservations` return the credit.
5. Refund: `refundTenderSplit` returns cash via Paystack and credit via `credit_refund_redemption` pro rata (`transaction.credit_refunded_amount`).

Stuck reservations (`reserved` past expiry + 2 h) raise the "Credit reservations need attention" incident; resolution SQL is in `../architecture/rewards-ledger.md` runbook.

## Where credit-funded sales touch cash accounting

- Organizer earnings are still 100% of the **ticket price** — including the part the buyer paid with credit. Abonten funds that part. This is why `payout_guard_review` holds payouts on events with > 20% credit-funded sales: finance confirms the buyers are genuine before paying cash out.
- Platform fee: the service fee is charged on the full ticket price; the fee's cash/credit split follows the tender.

## Reward types and their cash side

| Reward | Paid to | Charged to | Scope |
|---|---|---|---|
| Event referral (share link → sale) | sharer, credit | Abonten budget | general |
| Friend invite (welcome + inviter reward) | friend / inviter, credit | Abonten budget | general |
| Loyalty fee rebate (every 5th order on a different event) | buyer, credit | Abonten | general |
| Promoter commission (1–30% set by organizer) | promoter, credit | **organizer cash** via `promoter_commission` ledger entry, reversed on refund/cancel/dispute | general |
| Organizer rebate (20% of cash net revenue, monthly) / venue rebate (5%) / milestone | organizer / verified owner, credit | Abonten | **promotions only** |
| Place visits (per different visitor, monthly) | verified owner, credit | Abonten | promotions only |
| Goodwill (≤ GH₵ 50/user/month) | any user | Abonten | general |

Budget: `reward_budget_period` caps monthly postings at max(GH₵ 1,000, 25% of trailing net revenue) unless overridden; budget-exhausted rewards defer.

## Controls

- Risk scoring (`_reward_risk_weight`, `riskScore.ts`): blocking flags (self-referral, organizer-linked, same email/phone/payment method) → reject; score ≥ 70 reject, ≥ 30 review (Admin › Rewards › Review queue, `rewards.review`).
- Freeze an account: `rewards.freeze`. Adjust: `finance.adjust` + step-up, maker-checker ≥ GH₵ 500 (`credit_adjustment_request`).
- Emergency: `REWARDS_KILL_SWITCH=true` on the web deployment, or untick "Program switched on" in Admin › Rewards › Program settings.
- Tests: `credits-*`, `rewards-*` integration suites.

## Accounting treatment

How credit liabilities, rebates and promoter commissions are booked in Abonten's accounts (and any tax treatment) is outside the code — **legal/compliance item E6 and tax item E3**.
