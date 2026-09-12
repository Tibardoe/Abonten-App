---
title: Rewards operations
purpose: Day-to-day operation of Abonten Rewards — current state, launch sequence, routine checks, common cases — with pointers to the detailed runbook.
audience: Operations, finance_admin, founder
scope: reward_program_setting, reward_rule, review queue, credit accounts, delivery, kill switch
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Rewards operations

Detailed reference and SQL: `../architecture/rewards-ledger.md` (runbook section). Console: `../admin/rewards.md`. Finance view: `../finance/credit-tender-and-rewards-finance.md`.

## Current production state (2026-09-12)

Programme switched on **for shadow data only**; audience `staff`; **every rule in shadow** — the engine records decisions in `reward_event` without posting credit; reward push/email delivery shipped; `REWARDS_KILL_SWITCH` unset. Public UI describes the programme as "not yet available".

## Launch sequence (when decided — W1/W2)

1. Review shadow decisions for a few weeks: Admin › Rewards › Review queue and Accounts show what *would* have been paid and the risk flags.
2. Confirm budget (W3) and risk thresholds in Settings.
3. Set audience `beta` with a few user ids; make one rule live (Rules › Activate); test end to end with a real purchase; check delivery statistics.
4. Widen to `all`; announce with a Broadcast; update the public help page and Terms §12 (version bump).

## Routine

- **Daily:** Review queue (held rewards ≥ 30 score) — approve/reject with notes; incidents from the engine (dead letters, stuck reservations, rebate failures).
- **Weekly:** Accounts with frozen status; referral codes disabled; delivery failures.
- **Monthly (3rd):** `rewards-monthly-rebates` runs automatically at 03:00; check `reward_rebate_run` for failures and re-run the month from Admin › Rewards › Rebates if needed.
- **Budget:** `reward_budget_period` usage on the Overview; budget-exhausted rewards defer and are released when budget allows.

## Common cases

| Case | Do |
|---|---|
| "I invited a friend, no credit" | Check `user_referral` for the friend, and the `friend_referral_referee` reward event; typical reasons: invite not bound (not a new account / after first week), phone not verified, rejected for shared device/email/payment method |
| "I shared an event, no reward" | Referral rewards release only after the event has taken place and the sale settled; check the `event_referral` reward event status and flags |
| Suspected abuse | Freeze account; disable referral code; reject held rewards; Users › Suspend if warranted |
| Balance wrong | Ledger is the truth: compare and Adjust (audited; ≥ GH₵ 500 second admin) |
| Credit reservation stuck | Rewards-ledger runbook: capture or release the reservation idempotently |
| Emergency | Settings "Program switched on" off, or `REWARDS_KILL_SWITCH=true` on the web deployment |

## Never

Edit `credit_*` or `reward_event` tables by hand; quote risk flags to users; post credit outside the `credit_*` functions.
