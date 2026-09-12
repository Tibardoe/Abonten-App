---
title: Runbook — unauthorized refunds or payouts
purpose: Respond when a refund, payout, credit adjustment or field payout appears that no authorised person intended.
audience: Finance admins, founder, engineering
scope: finance.* and rewards.adjustment.* audit actions; Paystack refunds and transfers
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Runbook — unauthorized refunds or payouts

Severity S1.

1. **Detect:** Audit Logs show `finance.refund`, `finance.payout.*`, `rewards.adjustment.*`, `fieldops.payout.*` rows nobody recognises; Paystack dashboard shows refunds/transfers not matching Abonten; reconciliation incident; an organizer says they were paid twice.
2. **Confirm:** every refund in Abonten goes through `issueRefundCore` and leaves `refund_hold` + `finance.refund` (admin) or a buyer/organizer cancellation trail; every payout settlement leaves `finance.payout.settle`. A Paystack refund **without** an Abonten trail means the Paystack account itself was used → `leaked-secret.md` / provider account compromise.
3. **Contain:** disable the admin account involved (`admin-compromise.md`); rotate `PAYSTACK_SECRET_KEY` if Paystack was used directly; set `PAYSTACK_TRANSFERS_ENABLED` unset (it should already be); pause payout processing.
4. **Preserve:** export audit rows, transactions, payouts, Paystack exports.
5. **Assess:** total amount; whether money left Abonten's Paystack balance or bank/MoMo account; which organizers/users received it.
6. **Escalate:** commander; counsel; Paystack support (refund reversal is generally not possible — recovery is by request to the recipient); bank/MoMo provider for transfers.
7. **Remediate:** correct the books through audited tools only — `admin_settle_payout(failed/cancelled)` for unpaid payouts; ledger effects of a wrongful refund cannot be undone automatically (the `refund_hold` stands); record an adjusting `organizer_ledger_entry` only via a new audited RPC if the founder decides (engineering change) — otherwise document and net against future earnings; reverse credit adjustments (`credit_execute_adjustment` negative) with maker-checker.
8. **Communicate:** affected organizers/users; regulator only if personal data is implicated.
9. **Verify:** reconciliation clean; audit trail complete.
10. **Document / 11. Review:** alerting on finance audit actions; consider dual approval for refunds above a threshold (product decision).
