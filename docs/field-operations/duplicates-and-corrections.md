---
title: Duplicates, "needs changes", withdrawals and corrections
purpose: How duplicate detection works, how to fix or withdraw an onboarding, and what happens after verification when something is wrong.
audience: Field members, team leads, field_ops_manager
scope: fieldops_find_similar_places, onboarding status transitions, flags, reversals
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Duplicates, "needs changes", withdrawals and corrections

## Duplicate detection

`fieldops_find_similar_places`: name similarity (trigram) within the campaign's duplicate radius (300 m by default, similarity threshold 0.45), **or** an exact phone/WhatsApp match anywhere. Scoring (`duplicateScore`): a phone match is decisive; otherwise similarity discounted by distance; **strong** = inside the radius with similarity ≥ 0.6. The search runs in the wizard, again at submission (a strong match must be acknowledged; a same-phone match is refused — offer claim assistance), and once more in the sweep (an older duplicate is a soft flag).

## Before verification — you fix it

- **Needs changes:** the lead returned it with a note. Open `/field/submissions/[id]`, fix, resubmit. The **same** place is updated (the onboarding's request id is reused), so no duplicate is created.
- **Withdraw:** allowed from draft, submitted or needs_changes. The place already created stays with the owner (it is theirs); the onboarding is closed with no commission.
- **Wrong owner phone:** withdraw and start again with the right owner; the created account for the wrong number stays as an ordinary empty account.

## After verification — the system and admins handle it

- The owner can always edit their own listing; a factual mistake (hours, description) is fixed by them, or by you asking them.
- If the listing is unpublished, removed by moderation, or the owner changes before the holding period ends, the sweep **rejects** the onboarding — no commission.
- Soft problems (missing photos/hours, pin outside the territory, older duplicate) or a spot check → **flagged**; an admin approves or rejects with a note.
- A commission already **approved** or **paid** that turns out to be wrong is **reversed** by an admin: an approved one becomes reversed; a paid one keeps its paid row and gains a negative offset, so what left the account stays on record and is netted against your next batch.

## Duplicate listing already created (edge case)

If two listings exist for one business, the owner keeps the one they use; report the other through the normal Report flow (fake listing / duplicate) so a moderator hides it, and tell your lead — an onboarding that created a duplicate will not pass the sweep.

## Correcting the record

Nothing in the onboarding timeline (`fieldops_onboarding_event`) or commission history can be edited or deleted; corrections are new entries with the actor and reason. Do not ask anyone to "delete" a mistake — ask them to record the correction.
