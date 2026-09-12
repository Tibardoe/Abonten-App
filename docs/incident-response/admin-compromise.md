---
title: Runbook — compromised admin account
purpose: Lock out a compromised or misused administrator account and unwind what it did.
audience: Founder / super_admin, engineering
scope: apps/admin accounts (admin_user), Google accounts on the allowlist
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Runbook — compromised admin account

**Severity S1.** An admin can refund, pay out, ban, broadcast and read PII.

1. **Detect:** unexpected `admin_audit_log` rows (refunds, payouts, role grants, matrix edits, broadcasts) — Audit Logs; Sentry admin events with an unfamiliar id; the admin reports a phished Google session; a Google security alert.
2. **Confirm:** Audit Logs filtered by actor since the suspected time; compare with what the person says they did.
3. **Contain (minutes):**
   - Admin Settings › **Disable admin** (step-up) — takes effect on their next request.
   - Remove their email from `ADMIN_EMAIL_ALLOWLIST` and redeploy admin (outer gate).
   - Ask them to sign out of Google everywhere / secure the Google account; their step-up cookie dies with the session.
   - If a super_admin is compromised and you cannot disable them from the console: an engineer sets `admin_user.status = 'disabled'` via the service role (SQL through the Supabase MCP), and rotates `SUPABASE_SERVICE_ROLE_KEY` if there is any chance it was exposed.
4. **Preserve:** export their audit rows, Vercel request logs for the admin project, Sentry events.
5. **Assess:** every row they wrote: refunds (`finance.refund`), payouts (`finance.payout.*`), bans, role grants, matrix changes, broadcasts, rewards adjustments, field payouts. PII views are not individually logged — assume PII in the modules they had permission for was visible.
6. **Escalate:** commander; counsel (PII exposure → breach assessment per `pii-exposure-and-data-breach.md`); Paystack if fraudulent refunds/transfers left the platform.
7. **Remediate:** reverse through audited tools — restore banned users (`users.restore`), settle fraudulent payouts as `cancelled` where not yet paid, request return of paid amounts, reverse credit adjustments, revert matrix/role changes, delete nothing. Re-enable the admin only after the Google account is secured and, ideally, hardware-key 2FA is on.
8. **Communicate:** affected users via support/Broadcast as appropriate; regulator per legal B6 if personal data was exfiltrated.
9. **Verify:** no further rows by that actor; reconciliation clean; health green.
10. **Document:** incident row; retain exports.
11. **Review:** consider mandatory 2FA on Google Workspace, shorter step-up window, alerting on `admin.*` and `finance.*` audit rows, logging PII views.
