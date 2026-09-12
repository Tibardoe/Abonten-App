---
title: Admin › Users and Blocked users
purpose: Search and inspect accounts, understand what a suspension or ban does, and apply or reverse one correctly.
audience: operations, moderator (suspend only), support_admin (view), super_admin
scope: /users, /users/[id], /blocks
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin › Users

Source: `packages/services/src/admin/users/usersAdminCore.ts`, `moderation/blocksAdminCore.ts`.

## Search and inspect

- **Users list** (`users.view`): search by name, username or (with `users.view_pii`) email/phone; filter by status Active / Suspended / Banned.
- **User detail**: profile, status and its history, counts of events organized, places owned, tickets, reports filed and reports against them, admin notes (immutable; add a new one to correct), and links to their events, places, finance record and rewards account. Email and phone show only with `users.view_pii`.
- **Blocked users** (`/blocks`): who has blocked whom inside messaging (`conversation_block`) — read-only context for harassment cases.

## Statuses

| Status | Effect (enforced by code) |
|---|---|
| Active (1) | Normal |
| Suspended (2) | Web: every protected page redirects to "Your account is restricted". Mobile API: every call returns 403. Every existing session is revoked immediately. Cannot reply to reviews. Nothing is deleted. |
| Banned (3) | Same enforcement as suspended; intended as final. Requires step-up. |

There is no timed suspension and no automatic lifting; restoring is a manual `Active` action.

## Procedure — suspend or ban

1. Open the user. Read the reports against them and any notes. If the case came from a report, act from the report workspace so the report timeline gets the `action_taken` entry.
2. Choose **Suspend** (`users.suspend`) or **Ban** (`users.ban`, step-up). A reason is required and is stored in the audit log.
3. Confirm. The system refuses if the person is an admin ("Remove this person's admin roles before suspending or banning them") — an admin must first be disabled in Admin Settings.
4. Expected result: status changes; the user's sessions are revoked globally; audit row `user.status.suspended|banned`; if linked to a report, a `report_event` of kind `action_taken`.

## Procedure — restore

`users.restore` → **Restore**, with a reason. Audit `user.status.active`. The user can sign in again at once. Tell them through the support conversation if one exists.

## Dangerous actions

Ban (final in intent; step-up). Suspending an organizer with upcoming events does **not** cancel the events or refund buyers — decide with the founder whether the events must be cancelled (they can be, from the web app as the organizer cannot; an engineer may need to run `cancelEventCore` on the service role — record it).

## Privacy

Do not paste user data outside the console. Deletion of an account is not an admin action; see `../privacy/privacy-rights-operations.md`.
