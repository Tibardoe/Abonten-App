---
title: Earnings and payouts
purpose: How field commissions are earned, held, approved and paid (weekly mobile-money batches), for members and for the admins who run the batch.
audience: Field members, leads (own earnings), finance/field admins
scope: /field/earnings; Admin › Field Ops › Commissions, Review queue, Payouts
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Earnings and payouts

## For members

`/field/earnings` shows four buckets — **pending** (verified, in holding), **approved** (payable), **in payout** (in a batch being paid), **paid** — the live commission rate, each commission with its onboarding and dates, reversals struck through, and your payment history with references.

**Lifecycle of one commission:** lead verifies → `pending` with the rule and amount frozen → holding period (7 days default) → sweep → `approved` (or `rejected` / `flagged` → admin) → batch built → `in_payout` → transfer recorded → `paid`. A failed transfer returns it to `approved` for the next batch.

**Your payout number:** set your mobile-money number on the earnings page. Members without a number are **left out** of a batch and their money waits. You cannot change the number while a payment to the old one is in flight. The number is stored on your membership and hidden from your lead; finance admins see it masked except in the audited finance export.

**Stipends** (lead, content creator) appear as approved commissions once an admin runs the month.

**Questions:** ask your lead first; disputes about a rejection or reversal go to the field programme manager, who sees the full timeline.

## For admins — the weekly batch

Prerequisites: `fieldops.commissions.pay` (build, record payments) and `fieldops.commissions.approve` (approve the batch) held by **two different admins**; fresh step-up; access to the company mobile-money account; `payouts_enabled` on.

1. Admin › Field Ops › **Payouts** → choose the campaign → read the **preview**: members and amounts, and who is left out for want of a number. Only one open batch per campaign can exist.
2. **Build batch** → every `approved` commission moves to `in_payout`; items carry the masked destination as it stood.
3. A **different** admin opens the batch → **Approve for payment** (the database refuses `approved_by = created_by`).
4. Export the **finance CSV** (needs `users.view_pii`; built in the browser, audited `fieldops.payout.export`) or work down the list. Send each transfer from the mobile-money account.
5. For each item: **Paid** with the transfer reference (required) → its commissions become `paid` and the member is notified; **Failed** with a reason (required) → its commissions return to `approved` immediately.
6. The batch closes itself when nothing is pending. **Cancel** unwinds a batch only if nobody has been paid.

Checks: `fieldops_payout_reconciliation` and `fieldops_health()` keys assert ledger-paid = items-sent, nothing in `in_payout` without a live batch, nothing paid without a reference. `run_financial_reconciliation` opens an incident if they fail.

## Switches

Settings › "Commissions being generated" off → the sweep is a no-op while field work continues; "Payouts enabled" off → batches cannot be built and approved money waits. Nothing already recorded changes.

## Immutability

`fieldops_commission` allows only status and stamps to change along the lifecycle and has **no DELETE grant even for `service_role`**; `fieldops_commission_event` is append-only. A reversal of a paid commission is a negative offset row next to the original.

## Tax and status

Whether members are contractors or employees, and how commissions are taxed, is **legal item E8**.
