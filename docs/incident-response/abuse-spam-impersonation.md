---
title: Runbook — abusive user, spam, phishing, impersonation, malicious listing
purpose: Contain trust-and-safety incidents that go beyond a single report.
audience: Moderators, operations, founder
scope: Accounts, listings, messages, reviews, highlights
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Runbook — abusive user, spam, phishing, impersonation, malicious listing

Severity S2 (S1 for phishing that harvests credentials at scale or content endangering someone).

1. **Detect:** report queue (grouped view shows many reporters), Content sweep, support, a brand or person complaining of impersonation, users receiving phishing links via messages.
2. **Confirm:** open the target and the account; history of reports and actions; for phishing, do not open links — record them.
3. **Contain:** **Hide** the content (`moderation.hide`) or **Remove**; **Suspend** the account (revokes sessions, stops messaging); for messaging spam at scale, also disable referral codes if reward-motivated. Block guidance to targets.
4. **Preserve:** report attachments, message text (reported threads are readable), listing snapshots, account details (admin note).
5. **Assess:** how many recipients/viewers; whether payments were solicited off-platform; whether a real business/person is impersonated (contact them via a verified channel).
6. **Escalate:** founder for bans and for anything involving minors, threats or extortion (police); counsel for impersonation of a brand with legal exposure.
7. **Remediate:** **Ban** (step-up) for fraud/impersonation/phishing; Remove all their content via Content filtered by owner; refund buyers if tickets were sold (`payment-fraud-and-duplicates.md`); Broadcast a warning to affected recipients if a phishing campaign reached many.
8. **Communicate:** reporters are not told outcomes in detail (decision M3); victims via support.
9. **Verify:** no new accounts from the same phone/email/device — rewards `device_install` and Auth data can indicate re-registration; suspend clones.
10. **Document / 11. Review:** patterns → `content-moderation-policy.md` updates; consider automated report-threshold hiding (decision M1).
