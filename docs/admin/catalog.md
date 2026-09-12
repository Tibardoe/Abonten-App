---
title: Admin › Events, Places, Organizers
purpose: Read-only catalogue views for investigation, and where the actions for each live.
audience: All admin roles with the matching view permission
scope: /events, /events/[id], /places, /places/[id], /organizers, /organizers/[id]
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin › Events, Places, Organizers

Source: `packages/services/src/admin/catalog/catalogAdminCore.ts`. **No mutations live here.** These pages exist so you can understand a case before acting elsewhere.

## Events (`events.view`)

List with status (draft / published / canceled / archived), moderation state, organizer, date, tickets issued; detail with approximate sales (issued tickets × list price — the Finance module is authoritative), rating, reports against, moderation state, internal notes. Actions: **Content** (hide/restrict/remove), **Reports**, **Users** (organizer), **Finance › Transactions** filtered to the event.

Admins cannot edit, publish, unpublish or cancel an event from the console. Cancellation with refunds is the organizer's action in the web/app; if an organizer is unreachable or banned and the event must be cancelled, an engineer runs `cancelEventCore` on the service role with the founder's approval and records it.

## Places (`places.view`)

List with status, claimed/verified badges, moderation state, owner; detail with photos, hours, reports, bookings count, reviews. Actions elsewhere: **Claims** (ownership), **Content** (moderation), **Users** (owner). Admins cannot edit a listing's details.

## Organizers (`organizers.view`)

Anyone with at least one event or owned place. Detail: their events and places, rating, reports against, and the link to **Finance › Organizers › [id]** (earned / held / paid-out / outstanding, payout accounts masked, ledger, payouts, Create payout).

## Typical use

- A "fake event" report → Events › detail: does the organizer have a history? tickets sold? → Reports workspace to hide; Finance to hold payouts; Users to suspend.
- "My place shows wrong hours" → Places › detail confirms the owner → Support tells them how to edit (help centre) or, for a claim dispute, → Claims.
