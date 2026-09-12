---
title: Settlement, organizer ledger and payouts
purpose: How organizer earnings are recorded, when they become available, how payouts are requested, reviewed, paid and settled, and how the weekly finance routine runs.
audience: Finance admins, operations
scope: organizer_ledger_entry, payout, payout_account, admin_settle_payout, admin_create_payout, Paystack Transfers (flag off)
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Settlement, organizer ledger and payouts

## Earnings

- At ticket issuance `record_organizer_earning(checkout_id)` (inside `issue_tickets_for_checkout`) writes one `earning` row per paid checkout: `amount = gross_amount = ticket_checkout.total_price`, `fee_amount = 0`. **The organizer receives 100% of the ticket price.** Free tickets write nothing.
- **Settlement:** `is_event_settled(event_id)` is true **48 hours after the event's last occurrence ends** (`20260819110000_add_organizer_finances_ledger.sql`). Earnings for unsettled events are *pending*; settled ones are *available*.
- Deductions: `refund_hold` (refund requested), `promoter_commission` (a promoter's reward released — the organizer's cash pays the promoter's credit). Reversals: `refund_release`, `promoter_commission_reversal`.
- Organizer views: web `/finances` (Overview, Transactions, Payouts, Payout accounts), app Organizer › Finance / Payouts / Payout accounts / Withdraw; RPCs `get_organizer_finance_overview`, `get_organizer_pending_earnings`, `get_organizer_ledger_transactions`.

## Payout accounts

`payout_account` (`account_type` mobile_money | bank, `account_holder_name`, `provider`, `account_number`, one default active per organizer). Separate from `receiving_account` (legacy per-event field) and from the buyer's `payment_method` wallet. Full account numbers are visible in the admin console only with `users.view_pii`; elsewhere masked (`maskAccountNumber`).

## Payout request (organizer)

`request_organizer_payout(account, amount, currency)` — SECURITY DEFINER, `authenticated`: verifies account ownership and status, takes `pg_advisory_xact_lock(organizer, currency)`, recomputes available = Σ settled earnings + refund entries + payout entries + commission entries, rejects `amount > available` (the UI shows "balance stale" and refreshes), inserts `payout` (`processing`) and a `payout_hold` (−amount). No minimum beyond > 0 (decision F3). `payout_guard_review` sets `review_status = required` when > 20% of the covered events' sales were credit-funded or a dispute is open on them.

## Paying out (finance admin) — current manual procedure

**Prerequisites:** `finance.payout` permission, a fresh step-up (sign in again with `?stepup=1`, valid 10 minutes), access to the company bank / mobile-money account.

1. Admin › Finance › **Payouts**. Filter `processing`.
2. For each row: open the organizer (Finance › Organizers › [id]) and confirm outstanding ≥ payout amount, no open dispute (Finance › Transactions filter by the organizer's events), and `review_status` is `none` or `cleared`. If `required`: check the credit share and buyer/organizer linkage as described in `../architecture/rewards-ledger.md` "Held for review", then **Clear review** with a note, or settle as `cancelled` with a reason.
3. Send the transfer from the company account to the masked destination (reveal with `users.view_pii`). Keep the bank/MoMo reference.
4. Back in Payouts: **Settle…** → `completed` and paste the reference into the reason (`admin_settle_payout`; audit `finance.payout.settle`). If the transfer bounced: **Settle…** → `failed` with the reason — the ledger writes `payout_release` and the organizer's balance is restored.
5. The organizer is notified in the app.

Expected outcome: the payout row is `completed`, the ledger shows the `payout_hold` still standing (money left), the organizer's outstanding balance dropped by the amount.

### Creating a payout for an organizer who cannot

Finance › Organizers › [id] › **Create payout** (`admin_create_payout`) — same balance rules as the self-service request; then follow steps 3–4. Use only at the organizer's request recorded in the support conversation.

### Paystack Transfers (not live)

`sendPayoutAdminCore` exists behind `PAYSTACK_TRANSFERS_ENABLED`; with the flag unset it returns 409. To activate: enable Transfers on the Paystack account, set the flag on **both** `apps/web` (webhook) and `apps/admin` (action), add the UI button on `/finance/payouts`, and test with a small transfer. The webhook handlers for `transfer.*` will then settle payouts automatically. **Unverified against live Paystack** (decision F2).

## Cadence

Payout processing has no committed turnaround (decision F1). Recommended routine: process `processing` payouts twice a week, review `required` holds daily, and run the reconciliation review (`reconciliation.md`) before each payout run.

## Negative balances

A refund or cancellation after a payout can take an organizer's outstanding balance below zero; nothing claws cash back automatically. The negative balance nets against future earnings. Large negatives → founder.

## Field-programme payouts

Separate ledger, separate procedure: `../field-operations/earnings-and-payouts.md`. Field commissions are **never** mixed into `organizer_ledger_entry`.
