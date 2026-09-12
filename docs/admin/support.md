---
title: Admin › Support queue
purpose: Answer users' support conversations from the console — assignment, replies, closing, and what support staff can and cannot see.
audience: support_admin, operations, super_admin
scope: /support, /support/[id]
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin › Support queue

Abonten's support channel is the **in-app support conversation** (`conversation.type = 'support'`), opened by users from Messages › "Contact Abonten Support" (web), Account › Help & support (app), or the help centre's "Contact support" card. There is no public support email today (decision A3).

Source: `packages/services/src/admin/support/supportAdminCore.ts`. Permissions: `support.view`, `support.respond`.

## The queue

Open support conversations, newest activity first, with assignee, unread state and the user's name. Detail: the full thread, the user's profile summary (PII with `users.view_pii`), links to their tickets/transactions (Finance), reports, and rewards account.

## Actions

| Action | Effect | Audit |
|---|---|---|
| Assign to me / Unassign | ownership of the thread | `support.assign` / `support.unassign` |
| Reply | sends a message as Abonten Support; the user gets an in-app notification and (app) a push | `support.reply` |
| Close | marks the conversation closed for the queue; the user can write again to reopen | `support.close` |
| Reopen | back to open | `support.reopen` |

Support replies are visible to the user exactly like any message. Attachments you send follow the same storage rules.

## What support can see

Only **support** conversations and conversations that have been **reported**. Staff cannot browse users' private conversations with organizers or places (RLS: `is_staff()` grants read on `conversation`/`message`, but the console exposes only these two entry points; opening others is a policy breach and would show in the audit trail of what you queried).

## Standards

Acknowledge within the target in decision O1; never ask for card numbers, PINs or one-time codes; never promise a refund is complete before it is; link the help centre article when one answers the question; escalate money, safety and privacy matters per `support-scenarios.md`.
