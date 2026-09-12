---
title: Runbook — exposed personal information / data breach
purpose: Assess and respond to any event in which personal data may have been accessed, disclosed or lost, including the notification decision.
audience: Founder, counsel, engineering
scope: All personal data in privacy/data-inventory.md
status: Review required
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Runbook — exposed personal information / data breach

Severity S1. **No external statement without the incident commander's approval.**

1. **Detect:** any of: database exposure, leaked service-role key, admin compromise, a bug that showed one user another's data (support report, Sentry), a lost staff device with console access, a provider breach notice.
2. **Confirm:** reproduce read-only; identify the exact data categories and rows (`../privacy/data-inventory.md`); identify the window.
3. **Contain:** close the path (policy fix via MCP migration, key rotation, disable admin, roll back deploy, suspend account); kill switches if programme data is involved.
4. **Preserve:** exports of affected rows and access logs (Supabase `query_logs`, Vercel logs, Sentry, audit log); timeline in UTC.
5. **Assess:** number of people; categories (identity, contact, location, payment references, messages, health-adjacent content in messages?, children — none known); likelihood and severity of harm; whether data was merely accessible or actually accessed/exfiltrated.
6. **Escalate:** founder (commander) → counsel **immediately**. Under Act 843 the Data Protection Commission and affected individuals may need to be notified; **thresholds and timelines are legal item B6 — until confirmed, plan for notification without undue delay.**
7. **Remediate:** fix root cause; rotate anything possibly exposed; verify with tests; add advisors/tests.
8. **Communicate:** as decided with counsel — affected users via email (Resend) and in-app Broadcast with plain facts: what happened, what data, what we did, what they should do (e.g. beware of phishing), how to reach us; DPC notification per counsel.
9. **Verify:** exposure closed (re-test), no further anomalous access.
10. **Document:** incident row; a written breach record (what, when, who, decisions, notifications) retained permanently.
11. **Review:** post-incident review with counsel; update `LEGAL_REVIEW_REQUIRED.md`, `data-inventory.md` and this runbook.

## Ready-made checks

- Which tables could `anon` read: `select tablename, policyname, qual from pg_policies where roles @> '{anon}' or roles @> '{public}'`.
- Which users viewed PII in the console: not logged today (improvement item); rely on module permissions + session timing.
- Attendee-contact exposure via `get_event_attendee_contacts`: organizer-scoped by design; a breach is only if a non-organizer called it (function checks `auth.uid()` ownership).
