---
title: Admin › Claims
purpose: Review place ownership claims, understand what approval does to the listing, and handle disputes between claimants.
audience: operations, support_admin (view), super_admin
scope: /claims, /claims/[id]
status: Approved
version: 1.1
lastReviewed: 2026-11-26
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin › Claims

Source: `packages/services/src/admin/claims/claimsAdminCore.ts`; RPC `approve_place_claim` (the **only** code path that changes `place.owner_id`); tables `place_claim_request`, `place_claim_document` (private bucket, purged 30 days after decision); `place_claim_situation()` and `admin_place_claims_page()` (migration `20261126140000_claim_invite_disputes`).

## Where claims come from (since 2026-11-26)

The place page offers claiming by one rule (`@abonten/core/placeClaimInvite`, website and app):

- **Nobody is behind the place** — its owner's account was deleted, or Abonten's own staff listed it and nobody has claimed it (the owner is an active staff account and the place is not marked claimed). Visitors see a prominent **Claim this place**.
- **Someone runs the place** — it was claimed, or listed by its owner (Verified or not). There is no claim button. The place's "…" menu has a quiet **I own this business**, which opens the same form worded as an ownership dispute: another account manages this place, send proof, Abonten staff will review it and nothing changes meanwhile. An explanation is required.
- The owner and members of the team that owns the place are offered nothing, and the database refuses a claim from them.

## Ownership disputes

A waiting claim on a place that **someone else runs** is an **ownership dispute**. So is a claim by a member of the team that owns the place (approving it would move the place out of the team to that person). Where a claim stands is worked out each time it is read, not stored: a claim filed on a place nobody ran becomes a dispute the moment another claim on that place is approved.

- **Nobody is told when a dispute is filed.** Abonten does not notify the current owner automatically; telling them would invite harassment. You decide whether to contact them (through Support, by message or phone), usually before deciding a dispute. Record what you asked and what they said in an internal note.
- **Repeat disputes.** After you reject someone's claim on a place another account runs, that person cannot file another dispute on the same place for 30 days (the database refuses it, on the website, in the app and through Field Ops claim assistance). They see the date they may ask again. Other people are not affected, and a place nobody runs can be claimed again at once. One waiting claim per person per place and the website's 5 claims an hour still apply.

## The list

Pending, approved and rejected claims with place, claimant, documents and submitted date. Permission `claims.view`. The claimant's contact phone/email show with `users.view_pii`.

- **Pending** lists ownership disputes first, marked **Ownership dispute** (red), then the rest, newest first. The **Situation** column says what each waiting claim is: *Ownership dispute*, *Dispute: own team's place*, *Listed by Abonten*, *Owner's account deleted*, or *Already the owner*.
- **Disputes** lists waiting ownership disputes only.
- Decided claims have no situation; the audit entry of the decision says whether it was a dispute.

## Claim detail

Place summary and current owner, the claimant's note and contact details, uploaded documents (signed URLs, expire quickly), and the decision panel.

For a waiting dispute (and a place Abonten listed) a **Who runs the place now** card shows the account that has the place, its account state (active, suspended, banned), for a team its state and its active Owners, and **since when** it has had the place, as far as the records show: the date its own claim was approved, the date the team was made from the person who held the place, or the date it was listed.

## Deciding (`claims.review`, no step-up)

**Approve** → `approve_place_claim(request, admin)`: transfers `owner_id` to the claimant, sets `claimed = true`, marks the request approved, notifies the claimant, audits `claim.approve`. The previous owner loses management access immediately and is **not** notified automatically — message them through Support if appropriate.

**Approving an ownership dispute** asks for more: type the place's name in the panel (case and spacing do not matter; the server checks it too), then confirm a question that names who loses the place. The audit entry records `before.situation`, `before.owner_id` (the owner who lost it) and `after.dispute = true`, and its summary says "ownership dispute". Approve a dispute only on strong proof, after weighing both sides; if in doubt, reject with a reason and let the claimant come back with better evidence.

Since 2026-09-12 approving a claim **no longer verifies the place**. Verification is its own reviewed step with its own evidence and audit trail — see [verification.md](verification.md). A reviewer who judges the claim's attached documents good enough can tick **Also mark this place verified**, which runs `approve_place_claim_and_verify()` (both in one transaction) and audits `claim.approve_and_verify`. That option needs `verification.review` on top of `claims.review`, and it only appears when the claim actually carries documents and the place is not already verified.

If a verified place later changes owner through a claim, its badge is revoked automatically and any open verification request is withdrawn.

**Reject** → status `rejected`, notification to the claimant, audit `claim.rejected`. The claimant may file a new claim, except a new dispute on the same place within 30 days (above).

Both require a reason.

## What good evidence looks like

A business registration or licence in the claimant's name or business name matching the listing; a utility bill or lease for the address; signage photos; a phone number that matches the one on the listing. A **field-programme onboarding** with owner OTP is strong evidence the current owner is genuine (Field Ops › Onboardings shows it). When two people claim the same place, ask both for documents via Support and decide on the stronger evidence; record the reasoning in an admin note.

## Field-programme interaction

`fieldops_flag_on_claim` flags any field onboarding whose listing someone else later claims — a possible ownership dispute or a duplicate. Check Field Ops › Review queue when you see a claim on a recently onboarded place.

## Dangerous actions

Approval is a transfer of control over a business's public presence. Never approve on a note alone. There is no "undo" in the UI: reversing a wrong approval means the previous owner files a claim that you approve.
