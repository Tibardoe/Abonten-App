---
title: Admin › Content
purpose: Browse every moderatable item by moderation state and act on it directly, outside the report queue.
audience: moderator, operations, super_admin
scope: /content
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin › Content

Source: `packages/services/src/admin/content/contentBrowseCore.ts`. Permission per entity: `events.view`, `places.view`, `reviews.view` (reviews, highlights).

## What it shows

One tab per entity — events, places, event reviews, place reviews, user reviews, highlights — each row with its `moderation_state`, owner, report count and a search box. Filters: all moderated / hidden / removed / restricted / everything.

## Actions

Inline **Hide / Restrict / Remove / Restore** call the same `apply_moderation_action` RPC as the report workspace (same permissions, same audit rows). Use Content when the problem was found proactively rather than via a report — for example a batch of spam highlights from one account.

For a **review response** that breaks the rules while the review itself is fine, use **Clear response** (`moderation.remove`): it blanks the organizer's or owner's reply and keeps the review.

## Procedure — proactive sweep

1. Filter *everything*, sort newest, scan titles/thumbnails for obvious spam or prohibited content.
2. Act inline with a reason. For a pattern from one account, open the owner in Users and consider suspension.
3. Check the *hidden* filter weekly: anything hidden for more than two weeks should be either removed or restored (decision M2 governs durations).

## Expected result

The row's state updates immediately; the public read paths (discovery RPCs and RLS policies) reflect it on the next request; an audit row `moderation.<action>` exists.
