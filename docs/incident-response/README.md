---
title: Incident response
purpose: The incident-response framework — severity levels, roles, the eleven-step procedure every runbook follows, communication rules, and the post-incident review template.
audience: Founder (incident commander), engineering, operations, finance
scope: Security, payment, data, availability and provider incidents
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Incident response

## Severity

| Level | Definition | Examples | Response |
|---|---|---|---|
| **S1 — Critical** | Money at risk at scale, personal data exposed, platform down, admin compromise | Webhook secret leaked; mass duplicate charges; database publicly readable; site or payments down for all users | Immediate, all hands; founder as commander; status Broadcast when the console is available |
| **S2 — High** | A subset of users affected or a single account/high-value fraud | One organizer's payouts fraudulent; Hubtel down (phone sign-in only); a field agent account compromised | Within the hour; incident row; commander assigned |
| **S3 — Medium** | Degraded feature with a workaround | Push delivery failing; search stale; error spike on one screen | Same working day |
| **S4 — Low** | Cosmetic or single-user issue | One user's ticket email bounced | Support handles; no incident row required |

## Roles

- **Incident commander:** the founder (decision S1 for an on-call rota). Decides severity, owns communication, approves any external statement.
- **Responder:** engineer (technical actions), finance admin (money), moderator (content/accounts).
- **Scribe:** whoever creates the incident row keeps it updated; the row is the timeline of record.

## The procedure (every runbook follows it)

1. **Detect** — how we noticed (health panel, Sentry, reconciliation incident, report, provider email, user).
2. **Confirm** — reproduce or verify from records before acting; rule out a look-alike cause.
3. **Contain** — stop the bleeding with the least destructive lever: kill switch, disable an admin, suspend an account, freeze credit, pause a campaign, revoke a key, roll back a deployment.
4. **Preserve evidence** — export the relevant rows/logs before changing them (audit log, transactions, Sentry event ids, provider dashboard screenshots); note times in UTC and Accra.
5. **Assess scope** — who/what/how much; which data categories (`../privacy/data-inventory.md`).
6. **Escalate** — commander; counsel for data/legal exposure; providers (Paystack, Supabase, Resend) as needed.
7. **Remediate** — fix the cause; rotate secrets; correct records through audited tools only.
8. **Communicate** — internal updates on the incident row; user communication via Broadcast/support; regulator/user notification for breaches per legal B6 (timelines to be confirmed).
9. **Verify recovery** — health green, reconciliation clean, a real user flow tested.
10. **Document** — incident row resolved with summary; evidence stored.
11. **Post-incident review** — within a week: template below; actions into the roadmap and, where relevant, the registers.

## Runbooks

| Family | File |
|---|---|
| Suspected account takeover (user) | [account-takeover.md](account-takeover.md) |
| Compromised admin account | [admin-compromise.md](admin-compromise.md) |
| Compromised field-team account | [field-agent-compromise.md](field-agent-compromise.md) |
| Leaked API key or secret | [leaked-secret.md](leaked-secret.md) |
| Database exposure or suspicious database activity | [database-exposure.md](database-exposure.md) |
| Payment fraud, fraudulent tickets, duplicate payments, suspicious organizer | [payment-fraud-and-duplicates.md](payment-fraud-and-duplicates.md) |
| Webhook failure, mass failed payments | [webhook-and-mass-payment-failure.md](webhook-and-mass-payment-failure.md) |
| Unauthorized refunds or payouts | [unauthorized-refunds.md](unauthorized-refunds.md) |
| Abusive user, spam, phishing, impersonation, malicious listing | [abuse-spam-impersonation.md](abuse-spam-impersonation.md) |
| Malicious content or upload | [malicious-content-and-uploads.md](malicious-content-and-uploads.md) |
| Exposed personal information, data breach | [pii-exposure-and-data-breach.md](pii-exposure-and-data-breach.md) |
| Security vulnerability report | [vulnerability-report.md](vulnerability-report.md) |
| Service outage, notification/email/push outage, third-party outage | [outages-service-email-push-third-party.md](outages-service-email-push-third-party.md) |
| Sentry alert, elevated error rate | [sentry-and-error-rate.md](sentry-and-error-rate.md) |

## Tools you will use

Admin › Monitoring (health, error groups, incidents) · Admin › Users (suspend/ban) · Admin Settings (disable admin) · Admin › Rewards (freeze, kill switch) · Admin › Field Ops (pause campaign, switches) · Vercel (env, rollback, logs) · Supabase dashboard / MCP (`execute_sql`, `query_logs`, `get_advisors`) · Paystack dashboard · Sentry · Resend dashboard · Broadcast (Admin › Notifications).

## Post-incident review template

```
Incident: <title>            Severity: S_   Opened/Resolved: <UTC>
Impact: users / money / data affected
Timeline: detect → confirm → contain → remediate (times)
Root cause:
What worked / what didn't:
Actions (owner, due): 
Register updates (legal / decisions / limitations):
```
Store reviews as `docs/incident-response/reviews/YYYY-MM-DD-<slug>.md` (none yet).
