---
title: Admin › Reports & Moderation
purpose: Work the report queue — triage, investigate, act on content, resolve — and understand exactly what each moderation action does.
audience: moderator, operations, super_admin
scope: /reports, /reports/[id], grouped view, bulk resolution
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin › Reports & Moderation

Source: `packages/services/src/admin/reports/reportsAdminCore.ts`, `moderation/applyModerationActionCore.ts`, RPCs `apply_moderation_action`, `resolve_report`. Policy: `../operations/content-moderation-policy.md`.

## The queue

- **List view**: open reports, newest first, filter by status, category, target type, priority, assignee. Priority is seeded from the category (`safety`, `fraud_scam`, `harassment`, `impersonation`… → high) and can be raised.
- **Grouped view** (`/reports?view=grouped`): one row per reported item (`dedupe_key = target_type:target_id`) with the count of open reports — the fastest way to see what many people are flagging.
- **Report workspace** (`/reports/[id]`): the report, the target (with a preview and links to Content/Users/Events/Places), the reporter (PII gated), attachments (private bucket, signed URLs), the timeline (`report_event`), admin notes, and the action panel.

## Statuses

`new → under_review → (awaiting_info | escalated) → resolved | dismissed | false_report`. Terminal statuses cannot be reopened by the same path; a new report on the same item starts a new record.

## Actions and permissions

| Action | Permission | Effect |
|---|---|---|
| Assign to me / to someone | `reports.assign` | `assigned_to`; timeline `assigned` |
| Mark under review | `reports.update_status` | status |
| Request info | `reports.request_info` | status `awaiting_info`; **no message is sent to the reporter automatically** — use the support conversation if you need to ask them |
| Escalate | `reports.escalate` | status `escalated`, priority raised; the founder reviews escalated reports |
| Add note | `reports.note` | immutable `admin_note` |
| **Restrict** target | `moderation.restrict` | `moderation_state = restricted`: still visible, cannot be featured/promoted |
| **Hide** target | `moderation.hide` | `hidden`: disappears from every public read (discovery RPCs and RLS); the owner still sees it on their own management pages |
| **Remove** target | `moderation.remove` | `removed`: as hidden, but signals a final decision; also used to clear a review response (`clearReviewResponseCore`) |
| **Restore** | `moderation.restore` | back to `visible` |
| Resolve / Dismiss / Mark false report | `reports.resolve` / `reports.mark_false` | terminal status with a written resolution |
| Resolve all N (grouped view) | `reports.resolve` (+ the moderation permission if an action is chosen) | closes every open report on the item, optionally applying one moderation action first |

Moderation actions are **idempotent** (an idempotency key per action) and target `event`, `place`, `highlight`, `event_review`, `place_review`, `user_review`, `message`, `conversation`. **Users are not moderated here** — use Users › Suspend/Ban; the report workspace links there and records the action in the report timeline when you pass the report id.

## Procedure

1. Take the highest-priority open report; **Assign to me**; **Mark under review**.
2. Open the target. Judge against the policy. Look at the grouped view — how many independent reporters?
3. If the content breaks the rules: **Restrict / Hide / Remove** with a reason. If the *person* is the problem: Users › Suspend or Ban (from the report, so the timeline records it).
4. **Resolve** (action taken), **Dismiss** (no breach) or **Mark false report** (bad-faith report — repeated false reports count against the reporter).
5. For an item with many reports, use **Resolve all N** once.

Expected result: target state changed (visible in Content); report terminal; audit rows `moderation.<action>`, `report.resolve` (or `report.resolve_group`).

## What moderation does not do

- It never deletes rows or media. Removed content stays in the database (financial/legal reasons); its Cloudinary media stays until a separate cleanup.
- It sends **no automatic notification** to the content owner or the reporter. If the owner should know, message them through Support.
- There is no appeals workflow; a restore is the reversal path (decision O4).

## Dangerous actions

Remove on an event with sold tickets does not cancel it or refund anyone — if the event is fraudulent, coordinate with finance: cancel the event (refunds) and ban the organizer, and hold their payout. Hiding a place hides its bookings and reviews from the public too.
