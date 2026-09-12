---
title: Financial reconciliation
purpose: What the automated reconciliation checks, how its incidents appear, and the manual reconciliation a finance admin performs against Paystack.
audience: Finance admins, engineering
scope: run_financial_reconciliation, rewards_health, fieldops_health, Paystack dashboard reconciliation
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: yes
---

# Financial reconciliation

## Automated checks

`run_financial_reconciliation()` (`service_role`-only, pg_cron `financial-reconciliation` every 30 minutes; migration `20260907101000` plus later additions) evaluates:

| Check | Meaning if it fires |
|---|---|
| Paid checkout with no `earning` ledger entry | Ticket issuance and ledger diverged (should be impossible after the atomic RPC) |
| Succeeded payment attempt with no ticket | Fulfilment gap — customer paid, nothing issued |
| Negative `ticket_type.quantity` | Inventory corruption (blocked by CHECK; belt and braces) |
| `payment_attempt` stuck `processing` > 1 hour | The reaper (`recover_stale_payment_attempts`) has stopped |
| Credit invariants (`credit_reconciliation_checks`) | Cached `credit_account` balances ≠ ledger sums; unbalanced journals; reservations stuck |
| Field-ops invariants | A `succeeded` onboarding without exactly one live commission; a payable commission without a rule; ledger-paid ≠ payout-items-sent; `in_payout` without a live batch; `paid` without a reference (`fieldops_payout_reconciliation`) |

Each failing check opens **one** `incident` row via `open_reconciliation_incident()` (re-used while open) — visible in Admin › Monitoring › Incidents. `rewards_health()` and `fieldops_health()` feed the health panel with lag/backlog figures (check keys `rewards_health`, `fieldops`).

## Daily review (finance admin)

1. Admin › Monitoring: incidents list — any `reconciliation` incident open? Read the summary; follow the runbook it names (`payments-and-ticketing-runbook.md` §6, `../architecture/rewards-ledger.md` runbook, `../field-operations/earnings-and-payouts.md`).
2. Health panel: `self`, `paystack`, `resend`, `hubtel`, `cloudinary`, `expo`, `rewards_health`, `fieldops` all green.
3. Finance › Refunds: any `refund_pending` older than 3 working days → check Paystack.
4. Finance › Payouts: any `processing` older than the cadence you committed to; any `review_status=required`.

## Weekly Paystack reconciliation

1. Paystack dashboard → Transactions, export the week (successful, refunded, disputed).
2. Admin › Finance › Overview for the same range: **total charged** must equal Paystack's successful volume for ticket + promotion charges; **refunds** must match Paystack refunds; **processing cost** (from `platform_fee_entry.processing_cost`) should approximate Paystack fees (NULL where Paystack did not report a fee).
3. Differences: search each Paystack reference in Finance › Transactions. Missing in Abonten → webhook/verify never ran (replay). Present in Abonten but not Paystack → impossible for `successful` (verified server-side); check for a test-mode key mix-up.
4. Record the review as an admin note on a dedicated "Reconciliation" admin user or in the incident (decision F6 on where the record lives).

## Manual SQL (engineer, read-only, service role)

```sql
-- Paid checkouts without an earning row
select c.id from ticket_checkout c
left join organizer_ledger_entry l on l.ticket_checkout_id = c.id and l.entry_type = 'earning'
where c.status = 'paid' and l.id is null;

-- Credit ledger vs cached balance for one user
select la.code, sum(e.amount_minor) from credit_entry e
join credit_ledger_account la on la.id = e.ledger_account_id
where la.owner_user_id = '<user>' group by 1;
```

Never fix a discrepancy by editing a ledger table: use the RPCs (`record_*`, `credit_*`, `admin_settle_payout`) so the correction is itself a posted, audited row.
