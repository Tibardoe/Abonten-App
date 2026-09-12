---
title: Runbook — Sentry alert or elevated error rate
purpose: Triage an error spike across web, admin and mobile and decide between rollback, hotfix and monitoring.
audience: Engineering
scope: Sentry projects abonten-web / abonten-admin / abonten-mobile, self-hosted error groups
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Runbook — Sentry alert or elevated error rate

Severity: S2 if a core flow (sign-in, checkout, tickets, messaging) is affected; S3 otherwise.

1. **Detect:** Sentry alert email/Slack (if configured), Admin › Monitoring error groups count rising, support reports.
2. **Confirm:** open the Sentry issue: release, environment (preview vs production tag), affected users count, first seen. Cross-check the self-hosted error group (route/screen, platform, app version). Did a deployment or an EAS update ship just before?
3. **Contain:** if tied to a deploy → **roll back** (Vercel promote previous; `eas update --republish` previous for mobile); if tied to a provider → outage runbook; if a single feature → disable via flag if one exists (rewards/field kill switches) or hotfix.
4. **Preserve:** Sentry event ids, error-group fingerprint, deployment id.
5. **Assess:** user impact (money? data?) — if a bug exposed data across users → `pii-exposure-and-data-breach.md`; if payments affected → `webhook-and-mass-payment-failure.md`.
6. **Escalate:** commander if S2.
7. **Remediate:** fix with a test; deploy; mark the error group **resolved** (`monitoring.manage`) and the Sentry issue resolved in the release.
8. **Communicate:** only if users noticed (Broadcast/support macro).
9. **Verify:** error rate back to baseline for 1 hour; health green.
10. **Document:** incident row if S2+.
11. **Review:** add monitoring for the failure mode; consider Sentry alert rules on error-rate thresholds per project if not yet configured (decision: alert routing).

## Noise

Admin Sentry drops the guard's expected `AdminUnauthenticated`/`AdminForbidden` throws; mobile Sentry is disabled in development; error groups from `preview` deployments carry the `preview` environment tag — filter to `production` before acting.
