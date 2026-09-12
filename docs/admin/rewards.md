---
title: Admin › Rewards
purpose: Operate the Abonten Rewards programme from the console — accounts, review queue, rules, referrals, promoters and loyalty, rebates, settings — and understand what is live versus shadow.
audience: finance_admin, operations (view), super_admin
scope: /rewards/*
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: yes
---

# Admin › Rewards

> **Production state:** programme switch on for shadow data, audience `staff`, every rule in **shadow** (decisions recorded, no credit posted to the public). Nothing here pays real users until rules are made live and the audience widened (decisions W1–W3).

Source: `packages/services/src/admin/rewards/*` (`rewardsAdminCore`, `referralAdminCore`, `promoterLoyaltyAdminCore`, `rebateAdminCore`, `notificationDeliveryAdminCore`). Reference: `../architecture/rewards-ledger.md`. Finance view: `../finance/credit-tender-and-rewards-finance.md`.

| Screen | Shows | Actions (permission) |
|---|---|---|
| **Overview** | Programme status, budget period usage, pending/held/released totals, health | — |
| **Accounts** / **[userId]** | Credit balance by scope, lots and expiries, activity, reservations, referral code, reward decisions with **risk flags and reasons** (staff-only) | **Freeze / Unfreeze** (`rewards.freeze`); **Adjust credit** (`finance.adjust`, step-up; ≥ GH₵ 500 needs a second admin to execute); **Goodwill** (`rewards.goodwill`, ≤ GH₵ 50/user/month); **Disable / enable referral code** (`rewards.freeze`) |
| **Review queue** | Reward events held for human review (score 30–69) with flags explained | **Approve / Reject** (`rewards.review`) |
| **Rules** | Versioned rules per key (event_referral, friend_referral_*, loyalty_fee_rebate, promoter_commission, organizer_rebate, venue_rebate, milestone, place_visits) with shadow/live | **Publish version**, **Activate / Deactivate** (`rewards.configure`, step-up) |
| **Referrals** | Codes, touches, binds, attributions; abuse patterns | disable code |
| **Promoters & loyalty** | Promoter commission events and organizer charges; loyalty cycles | — |
| **Rebates** | Monthly runs, per-event decisions, failures | **Run a month now** (`rewards.configure`, step-up) |
| **Settings** | Programme switch, audience (`staff`/`beta`/`all`), beta users, budget, risk weights, notification switches, delivery statistics (sent / waiting / skipped / failed, 7 days) | edit (`rewards.configure`, step-up) |

## Common procedures

- **Suspicious referrer:** Accounts › user › Referrals › Disable code; reject their held rewards; consider Users › Suspend. Audit `rewards.referral_code.disable`.
- **Balance dispute:** never edit tables; compare the ledger (`reconciliation.md`), then Adjust credit with a note.
- **Programme launch:** Settings › audience `beta` + beta user ids → verify with a real purchase → Rules › Activate the chosen rule(s) → widen to `all`. Announce with Notifications › Broadcast.
- **Emergency stop:** Settings › "Program switched on" off, or `REWARDS_KILL_SWITCH=true` on the web deployment.

Every action is audited under `rewards.*` (see `audit-logs.md`).
