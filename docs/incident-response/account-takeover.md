---
title: Runbook — suspected user account takeover
purpose: Contain and investigate a report or signal that someone else is using a user's account.
audience: Operations, support, engineering
scope: End-user accounts (customers, organizers, place owners)
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Runbook — suspected user account takeover

Typical S2 (S1 if an organizer's payout account was changed or many accounts are affected).

1. **Detect:** user report via support ("I didn't buy this", "my payout number changed"), unusual payout-account change followed by a payout request, rewards risk flags, Sentry auth anomalies.
2. **Confirm:** Users › detail: last changes; Finance › Organizers › ledger and payout accounts (`payout_account.updated_at`), recent transactions; Supabase Auth logs for the user (sign-in method, times). Abonten has no per-user session list in the console — use Supabase Auth logs.
3. **Contain:** Users › **Suspend** (reason "suspected takeover") — this revokes every session globally (`auth.admin.signOut` global). If a payout is `processing` to a new account: Finance › Payouts › **Settle… → cancelled** (money returns to the ledger). Freeze the credit account if rewards are involved.
4. **Preserve:** export the user's recent transactions, payout account rows, audit rows, Auth logs; note times.
5. **Assess:** what was done while compromised (purchases, payout changes, messages sent, listings edited). Were other accounts affected via the same phone/email/device (`device_install`, `abn_did`)?
6. **Escalate:** commander; finance for any money moved; if personal data of others was read (attendee lists), treat as a data exposure (`pii-exposure-and-data-breach.md`).
7. **Remediate:** verify the real owner through the support conversation history and other means agreed by the commander (decision O2); have them change phone/email from a fresh session; remove the attacker's payout account; refund fraudulent purchases if the real owner was charged (finance); restore the account (`users.restore`).
8. **Communicate:** the user via support; affected third parties if their data was accessed.
9. **Verify:** user signs in on their device; no further anomalies for 48 h.
10. **Document:** incident row; admin notes on the account.
11. **Review:** was the entry point weak OTP hygiene (phone SIM swap), a shared device, or a platform issue? Feed into hardening (e.g. notify on payout-account change — improvement item).
