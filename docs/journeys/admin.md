---
title: Admin journey
purpose: A day in the admin console — login, monitoring, moderation, support, finance, security, reporting, audit — and where each step is documented.
audience: New admin staff, founder
scope: apps/admin
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin journey

```mermaid
flowchart LR
  L[Google login + allowlist + roles] --> D[Dashboard: health, needs attention] --> M[Moderation queue] --> S[Support queue] --> F[Finance: refunds, payouts, reconciliation] --> X[Security: users, admins, incidents] --> R[Reporting: analytics] --> A[Audit review]
```

| Stage | Admin does | System | Docs |
|---|---|---|---|
| **Login** | Google; allowlist; roles; step-up when needed | `requireAdmin`, `resolveAdminContext`, `admin_stepup_at` | admin/README, settings-and-rbac |
| **Monitoring** | Health panel, incidents, error groups | probes every 2 min; `incident`; `app_error_group` | admin/monitoring-and-incidents |
| **Moderation** | Reports queue → act → resolve; Content sweeps | `apply_moderation_action`, `resolve_report` | admin/reports-and-moderation, content; operations/content-moderation-policy |
| **Support** | Support conversations; scenarios | `supportAdminCore` | admin/support, support-scenarios |
| **Users** | Investigate; suspend/ban/restore | `setUserStatusCore` (global sign-out) | admin/users |
| **Claims** | Review evidence; approve/reject | `approve_place_claim` | admin/claims |
| **Finance** | Overview; transactions trace; refunds; payouts; per-organizer | `financeAdminCore`, `financeActionsCore`, `admin_settle_payout`, `admin_create_payout` | admin/finance, finance/* |
| **Rewards / Field Ops** | Review queues; rules; settings; batches | admin cores; kill switches | admin/rewards, admin/field-ops |
| **Notifications** | Resend; broadcast service notices | `notificationsAdminCore` | admin/notifications |
| **Security** | Disable admins; roles; incidents; runbooks | Admin Settings; `admin_audit_log` | admin/settings-and-rbac, incident-response |
| **Reporting** | Analytics; Field Ops figures; finance overview | `analyticsAdminCore`, `fieldops_campaign_stats` | admin/analytics |
| **Audit** | Read the log; monthly review of finance/user/admin actions | `admin_audit_log` (append-only) | admin/audit-logs |
