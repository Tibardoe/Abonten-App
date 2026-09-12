---
title: Admin › Admin Settings and the permission model
purpose: Manage staff accounts and roles, edit the role → permission matrix safely, and understand every permission key and step-up rule.
audience: super_admin; anyone who needs to understand what a role allows
scope: /settings; admin_user, admin_user_role, admin_role_permission, @abonten/core/adminPermissions
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: yes
---

# Admin › Admin Settings and the permission model

Source: `packages/services/src/admin/settings/adminSettingsCore.ts`, `adminContext.ts`; `packages/core/src/adminPermissions.ts`; migrations `20260903215520_admin_rbac`, `20260904031948_admin_role_matrix_guard`.

## Staff accounts

- **Add an admin** (`admins.manage`, step-up): the person must already have an Abonten account (they sign in to the console with Google, so their Google email must match). Grant one or more roles. Their `user_info.is_admin` flips to true by trigger — this is what lets them pass the staff checks in the database.
- **Disable an admin** (`admins.manage`, step-up): `admin_user.status = disabled`; they lose the console immediately (context re-resolved per request). Their audit history stays.
- **Revoke a role**: same permission. `super_admin` rows are immutable in the database (trigger) — the super admin cannot be locked out by editing the matrix.

Also keep `ADMIN_EMAIL_ALLOWLIST` on the admin deployment in step; it is the outer gate.

## The permission matrix

Admin Settings shows a grid of roles × permission keys read from `admin_role_permission`. Editing it (`settings.manage`, step-up) takes effect immediately for everyone with that role. Safety nets in `resolveAdminContext`: if the matrix cannot be read, or a role has **zero** rows, the compiled defaults from `adminPermissions.ts` apply — so a mistaken edit cannot lock everyone out; `super_admin` always holds every key.

## Permission keys (55)

`dashboard.view` · `reports.view` `reports.assign` `reports.update_status` `reports.request_info` `reports.escalate` `reports.note` `reports.mark_false` `reports.resolve` · `moderation.hide` `moderation.remove` `moderation.restore` `moderation.restrict` · `users.view` `users.view_pii` `users.suspend` `users.ban` `users.restore` · `organizers.view` `events.view` `places.view` `tickets.view` `transactions.view` · `finance.view` `finance.refund` `finance.payout` `finance.adjust` · `claims.view` `claims.review` · `reviews.view` · `notifications.view` `notifications.send` `notifications.broadcast` · `monitoring.view` `monitoring.manage` `incidents.manage` · `analytics.view` · `audit.view` · `settings.view` `settings.manage` `admins.manage` · `support.view` `support.respond` · `rewards.view` `rewards.review` `rewards.freeze` `rewards.goodwill` `rewards.configure` `rewards.withdrawals` · `fieldops.view` `fieldops.manage` `fieldops.rules` `fieldops.verify` `fieldops.commissions.approve` `fieldops.commissions.pay`

## Step-up permissions (13)

`users.ban`, `finance.refund`, `finance.payout`, `finance.adjust`, `notifications.broadcast`, `admins.manage`, `settings.manage`, `rewards.configure`, `rewards.withdrawals`, `fieldops.manage`, `fieldops.rules`, `fieldops.commissions.approve`, `fieldops.commissions.pay`. Step-up = a Google re-authentication within the last 10 minutes, proven by the signed `admin_stepup_at` cookie bound to the admin's id (`stepUpToken.ts`). `users.suspend` deliberately does **not** need step-up; `users.ban` does.

## Separation-of-duty rules enforced in the database

- A costlier field-programme rule version must be activated by a different admin than the one who published it.
- A field payout batch must be approved by a different admin than the one who built it (`approved_by <> created_by` CHECK).
- A credit adjustment ≥ GH₵ 500 must be executed by a second admin.
- The admin who verified a field onboarding cannot decide its flag.

## Access review

Quarterly: list active admins and roles; confirm each still needs them; disable leavers; check `ADMIN_EMAIL_ALLOWLIST`; read `admin.*` audit entries since the last review.
