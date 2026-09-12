---
title: Admin › Notifications
purpose: Browse users' in-app notifications, re-send one, broadcast to a segment, and read the delivery statistics for pushes and emails.
audience: operations, super_admin (broadcast), analyst (view)
scope: /notifications, /notifications/[id]
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin › Notifications

Source: `packages/services/src/admin/notifications/notificationsAdminCore.ts`. Operations detail: `../operations/notifications-and-email-operations.md`.

| Action | Permission | What happens |
|---|---|---|
| Browse / filter (type, recipient, unread, text) | `notifications.view` | Reads `notification`; recipient email shown with `users.view_pii` |
| **Resend** | `notifications.send` | Creates a fresh notification row for the same recipient and fires a best-effort push (`createNotificationCore`). Audit `notification.resend` |
| **Broadcast** | `notifications.broadcast` (super_admin by default), step-up | In-app notification to a segment: **all users**, **event attendees** (tickets active/used for an event), or **a single user**. Inserted in chunks of 500, cap 50,000 recipients, rate-limited per admin. **In-app only — no push or email fan-out.** Audit `notification.broadcast` with the count |

## Use broadcast for

Service notices (planned maintenance, policy changes with their effective date, a cancelled event's follow-up from Abonten). Not for marketing — there is no consent basis for marketing messages (legal G1).

## Delivery statistics

Reward push/email delivery (the `notification_delivery` queue) is shown under **Rewards › Settings** (sent / waiting / skipped / failed, 7 days). Ticket and cancellation emails are sent directly through Resend and are visible in the Resend dashboard, not here.
