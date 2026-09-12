---
title: Field roles — what each can and cannot do
purpose: State precisely, from the enforced rules, what members, content creators, team leads and admins can do in the field programme.
audience: Field team, leads, field_ops_manager
scope: fieldops_team_member roles; RLS and triggers on fieldops_* tables; admin permissions fieldops.*
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Field roles — what each can and cannot do

Roles are recorded on the team membership (`fieldops_team_member.role`): **team_lead**, **content_creator**, **offline_member**, **online_member**. Membership status: invited → active → suspended / left. One membership per person per campaign; one active lead per team.

## Everyone on the team

**Can:** see their campaign, its region and territories; see their own memberships, assignments, prospects, onboardings, earnings and payout history; receive announcements and notifications.

**Cannot** (enforced in the database — clients have read-only access to every `fieldops_` table): write to any field table directly; see another member's earnings or payout number; see payout details of anyone; see programme settings or rule amounts beyond "the live rate" shown on the earnings page; see other campaigns; become an admin (admins are refused as team members and vice versa); be the business owner or organizer of a listing they onboard; claim a listing for themselves.

## Offline member

**Can:** start today's assignment with a **GPS check-in**, complete it; add prospects (businesses spoken to) in a territory they hold an open assignment for and log contact attempts; run the onboarding wizard in person (owner enters the OTP on the member's device or their own); submit up to the daily cap (8 by default); upload evidence photos (storefront + interior required for offline work); withdraw or fix their own onboardings before verification.

**Cannot:** submit outside an active campaign (winding-down campaigns accept only fixes to returned work); submit without the owner's verified consent; skip evidence.

## Online member

Same as offline, without GPS check-in and evidence photos; the owner consents by **opening a consent link** on their own phone (30-minute token) or by OTP.

## Content creator

**Can:** see briefs, submit content deliverables (platform, URL, caption, self-reported figures) — one per post URL programme-wide; see own history and earnings.

**Cannot:** onboard businesses; have figures counted towards payment (engagement numbers are never paid on); review own content (a CHECK refuses self-review).

## Team lead

**Can:** add/edit territories in the campaign's region and mark them completed/reopened; plan and cancel assignments (draft/active campaign); invite members by phone, suspend/reactivate/remove members (open assignments cancel automatically); send announcements; review submitted onboardings (verify / needs changes / reject with a note) and content; see the coverage board, team performance and the queue; see members' prospects (with owner phones **masked**).

**Cannot:** appoint or remove another lead, or edit their own row; see payout numbers or amounts owed to anyone; change rules, settings or campaign status; decide flags or pay commissions; verify their own submission (reviewer ≠ member is a CHECK).

## Business owner / organizer (not a team member)

**Can:** consent by OTP or link; find the new listing under their own account; edit it; withdraw consent by asking Abonten to remove the listing.

**Cannot:** be a team member (the phone check refuses it).

## Admins (console)

| Permission | Allows | Step-up |
|---|---|---|
| `fieldops.view` | read everything | — |
| `fieldops.manage` | regions, territories, campaigns, teams, settings | yes |
| `fieldops.rules` | publish / make live commission rule versions | yes |
| `fieldops.verify` | decide a submitted onboarding in the lead's place (audited override) | — |
| `fieldops.commissions.approve` | decide flags, reverse commissions, run stipends, approve payout batches | yes |
| `fieldops.commissions.pay` | build batches, record payments, export the finance CSV (CSV also needs `users.view_pii`) | yes |

Separation of duties: a costlier rule version must be activated by a different admin from its publisher; a payout batch must be approved by a different admin from its builder (database CHECK); the admin who verified an onboarding may not decide its flag.
