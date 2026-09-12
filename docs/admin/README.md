---
title: Admin console handbook
purpose: Explain the Abonten admin console (admin.abontenhub.com) — signing in, the permission model, every module, which actions are dangerous, and how everything is audited.
audience: Abonten staff with admin access; the founder; engineers supporting them
scope: apps/admin, the admin service layer in packages/services/src/admin, the RBAC tables
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin console handbook

## Signing in

1. Open admin.abontenhub.com and sign in with **Google**. There is no phone or email option in the console.
2. Your email must be on `ADMIN_EMAIL_ALLOWLIST` (an environment variable on the admin deployment). If it is not, you see "No access" and the console does not reveal that it exists.
3. You must have an **active** `admin_user` row with at least one role. Roles and permissions are re-read on every request, so a change takes effect immediately.
4. **Step-up:** actions that move money, ban people, broadcast, change settings or edit the field programme require that you re-authenticated within the last **10 minutes**. The console sends you through Google again (`?stepup=1`); the result is a signed cookie bound to your account. Expect to do this before each sensitive action.

## Roles and what they can do

| Role | Intended for | Highlights | Cannot |
|---|---|---|---|
| `super_admin` | Founder | Everything, including granting roles and editing the permission matrix | — |
| `operations` | Day-to-day ops | Everything except money movement, broadcasts, admin/settings management, rewards configuration, field rules/approve/pay | refund, payout, adjust credit |
| `moderator` | Trust and safety | Reports (all actions), moderation (hide/remove/restore/restrict), users view + **suspend**, read events/places/reviews/organizers, monitoring view | ban, finance, claims review, notifications |
| `finance_admin` | Money | Finance view/refund/payout/adjust, transactions, tickets, rewards (view/review/freeze/goodwill/configure/withdrawals), field commissions approve/pay, audit, analytics | moderation, user suspension, settings |
| `support_admin` | Support desk | Users incl. PII, tickets, transactions, events, places, organizers, reports view+note, claims view, reviews view, **support queue**, rewards view + goodwill | any status change, refunds, moderation actions |
| `analyst` | Read-only | Every `*.view` permission | any write |
| `field_ops_manager` | Field programme | All six `fieldops.*`, read users/places/events/organizers/audit | finance, settings |

The live matrix is the `admin_role_permission` table (editable in Admin Settings for every role except `super_admin`); `@abonten/core/adminPermissions.ts` is the seed and fallback. Full key list: `settings-and-rbac.md`.

## Modules

| Sidebar entry | Permission to see it | Page |
|---|---|---|
| Dashboard | `dashboard.view` | [dashboard.md](dashboard.md) |
| Reports & Moderation | `reports.view` | [reports-and-moderation.md](reports-and-moderation.md) |
| Content | `reviews.view` | [content.md](content.md) |
| Claims | `claims.view` | [claims.md](claims.md) |
| Verification | `verification.view` | [verification.md](verification.md) |
| Support | `support.view` | [support.md](support.md) |
| Blocked users, Users | `users.view` | [users.md](users.md) |
| Organizers, Events, Places | `organizers.view`, `events.view`, `places.view` | [catalog.md](catalog.md) |
| Finance | `finance.view` | [finance.md](finance.md) |
| Rewards | `rewards.view` | [rewards.md](rewards.md) |
| Field Ops | `fieldops.view` | [field-ops.md](field-ops.md) |
| Notifications | `notifications.view` | [notifications.md](notifications.md) |
| Monitoring | `monitoring.view` | [monitoring-and-incidents.md](monitoring-and-incidents.md) |
| Analytics | `analytics.view` | [analytics.md](analytics.md) |
| Audit Logs | `audit.view` | [audit-logs.md](audit-logs.md) |
| Admin Settings | `settings.view` | [settings-and-rbac.md](settings-and-rbac.md) |

The top-bar **search** (`/search?q=`) finds users, events, places, transactions and reports by name, title, event code, Paystack reference, email or exact UUID — you only see groups you have permission to open.

## Dangerous actions (step-up required)

Ban a user · refund · settle / create / send a payout · clear a payout review · adjust credit · broadcast a notification · grant or revoke admin roles · enable/disable an admin · edit the permission matrix · change rewards or field-programme settings and rules · approve / pay field commissions and payout batches. Each needs a written reason and writes an `admin_audit_log` row.

## The audit log

Every mutation records who, what, which record, and the reason in `admin_audit_log` (append-only — no update or delete is possible, even for engineers). Read it under Audit Logs. Reports and support threads also keep their own timelines (`report_event`, support conversation).

## Rules of the road

- Use the minimum permission needed; ask the founder for a role change rather than sharing accounts.
- Personal data (emails, phones, account numbers) is behind `users.view_pii`; open it only when the task needs it. It is not exported anywhere except the field-ops finance CSV, which is audited.
- Never act on a report or a refund without reading the record first; write reasons a colleague can understand a year later.
- Anything that looks like fraud, a breach or an outage: stop and follow `../incident-response/README.md`.

## Support scenarios

The most common requests, in **Situation → Diagnosis → Steps → Expected result → Escalation** form: [support-scenarios.md](support-scenarios.md).
