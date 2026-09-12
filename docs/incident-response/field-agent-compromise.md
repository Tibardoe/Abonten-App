---
title: Runbook — compromised or fraudulent field-team account
purpose: Handle a field team member whose account is compromised, or who is fabricating onboardings.
audience: field_ops_manager, team leads, finance
scope: fieldops_team_member accounts and their submissions/commissions
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Runbook — compromised or fraudulent field-team account

Severity S2 (S3 if the programme is off — no live impact).

1. **Detect:** lead notices check-ins far from territory, reused evidence, owners denying consent; sweep flags (`older duplicate`, spot checks); `fieldops_flag_on_claim` disputes; a member reports a lost phone.
2. **Confirm:** Admin › Field Ops › Onboardings filtered by member: positions vs pins, evidence photos (signed URLs), owner OTP timeline (`fieldops_onboarding_event`), duplicate snapshots; call a sample of owners (an admin with `users.view_pii` sees the owner phone).
3. **Contain:** lead **Suspend** the membership (open assignments cancel) or admin sets member status; Settings › "Commissions being generated" off if abuse is broad; do **not** build a payout batch that includes them. Also Users › Suspend the Abonten account if the account itself is compromised (revokes sessions).
4. **Preserve:** the onboarding and commission timelines are append-only — nothing to export urgently; screenshot evidence links if needed.
5. **Assess:** count affected onboardings and listings; whether owners really consented; whether payments were already made.
6. **Escalate:** field_ops_manager → founder; moderators for fabricated listings.
7. **Remediate:** reject/flag affected onboardings (`fieldops.verify` / flag decision); **reverse** commissions (`fieldops.commissions.approve`, step-up — paid ones get a negative offset netted against future pay; unpaid become reversed); hide/remove fabricated listings via Content; message affected owners via support; remove the member.
8. **Communicate:** the team via announcement (without naming), owners individually.
9. **Verify:** `fieldops_health()` and reconciliation clean; no further submissions by the account.
10. **Document:** incident row; audit rows exist for every decision.
11. **Review:** adjust `spot_check_bps`, duplicate thresholds or daily cap in Settings; consider requiring lead field visits for high-value territories.
