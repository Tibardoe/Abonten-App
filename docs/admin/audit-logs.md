---
title: Admin › Audit Logs
purpose: How to read the append-only audit log and the full list of action names it can contain.
audience: analyst, finance_admin, super_admin, reviewers
scope: /audit
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: yes
---

# Admin › Audit Logs

`admin_audit_log` records every administrative mutation: actor (admin user id), action, target type and id, free-text reason, metadata, timestamp. It is **append-only**: no UPDATE or DELETE grant exists for any role, and a trigger refuses both. Even an engineer with the service-role key cannot rewrite history. If the audit write itself fails, the action still completes and the failure is logged loudly (`adminContext.ts`).

Permission `audit.view`. Filter by actor, action prefix, target, date. Source: `packages/services/src/admin/audit/listAuditLogCore.ts`.

## Action names

| Area | Actions |
|---|---|
| Users | `user.status.active`, `user.status.suspended`, `user.status.banned` |
| Moderation | `moderation.hide`, `moderation.unhide`, `moderation.remove`, `moderation.restore`, `moderation.restrict`, `moderation.unrestrict`, `moderation.clear_review_response` |
| Reports | `report.assign`, `report.escalate`, `report.status_change`, `report.request_info`, `report.resolve`, `report.resolve_group`, `admin_note.add` |
| Claims | `claim.approved`, `claim.rejected` |
| Finance | `finance.refund`, `finance.payout.settle`, `finance.payout.create`, `finance.payout.send`, `finance.payout.review_clear` |
| Notifications | `notification.resend`, `notification.broadcast` |
| Monitoring | `error_group.status`, `incident.create`, `incident.update` |
| Admin settings | `admin.role_matrix.set`, `admin.role.grant`, `admin.role.revoke`, `admin.status` |
| Support | `support.assign`, `support.unassign`, `support.reply`, `support.close`, `support.reopen` |
| Rewards | `rewards.reward.approve`, `rewards.reward.reject`, `rewards.rule.publish`, `rewards.rule.activate`, `rewards.rule.deactivate`, `rewards.referral_code.disable`, `rewards.referral_code.enable`, `rewards.adjustment.request`, `rewards.adjustment.execute`, `rewards.adjustment.reject`, `rewards.goodwill.grant`, `rewards.account.freeze` / unfreeze, `rewards.settings.update`, `rewards.rebates.run` |
| Field Ops | `fieldops.campaign.create|update|<status action>`, `fieldops.region.create|update`, `fieldops.territory.create|update`, `fieldops.member.add|<status>|role`, `fieldops.rule.publish|activate|deactivate`, `fieldops.settings.update`, `fieldops.onboarding.<decision>`, `fieldops.flag.<decision>`, `fieldops.content.<decision>`, `fieldops.stipends.run`, `fieldops.commission.reverse`, `fieldops.payout.build|approve|<status>|cancel|export` |

## Other trails

- `report_event` — per-report timeline (created, assigned, status_changed, note_added, info_requested, escalated, action_taken, resolved, reopened).
- `moderation_action` — canonical, idempotent record of every content state change.
- `credit_journal` / `credit_entry`, `organizer_ledger_entry`, `platform_fee_entry` — money, append-only.
- `fieldops_onboarding_event`, `fieldops_commission_event` — field-programme timelines, append-only by trigger.
- Sentry — technical errors with admin id and role keys (no email).

## Reviews

Suggested: a monthly read of `finance.*`, `user.status.banned`, `admin.*` and `rewards.adjustment.*` entries by the founder. Retention: permanent (decision R9).
