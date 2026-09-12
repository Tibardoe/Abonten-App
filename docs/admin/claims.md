---
title: Admin › Claims
purpose: Review place ownership claims, understand what approval does to the listing, and handle disputes between claimants.
audience: operations, support_admin (view), super_admin
scope: /claims, /claims/[id]
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Admin › Claims

Source: `packages/services/src/admin/claims/claimsAdminCore.ts`; RPC `approve_place_claim` (the **only** code path that changes `place.owner_id`); tables `place_claim_request`, `place_claim_document` (private bucket, purged 30 days after decision).

## The list

Pending, approved and rejected claims with place, claimant, submitted date. Permission `claims.view`. The claimant's contact phone/email show with `users.view_pii`.

## Claim detail

Place summary and current owner (with how the listing was created — by a user, or by a field team under the owner's consent), the claimant's note and contact details, uploaded documents (signed URLs, expire quickly), whether the claimant already owns other places, reports against the place, and the decision panel.

## Deciding (`claims.review`, no step-up)

**Approve** → `approve_place_claim(request, admin)`: transfers `owner_id` to the claimant, sets `claimed = true` and `verified = true`, marks the request approved, notifies the claimant, audits `claim.approved`. The previous owner loses management access immediately and is **not** notified automatically — message them through Support if appropriate.

**Reject** → status `rejected`, notification to the claimant, audit `claim.rejected`. The claimant may file a new claim.

Both require a reason.

## What good evidence looks like

A business registration or licence in the claimant's name or business name matching the listing; a utility bill or lease for the address; signage photos; a phone number that matches the one on the listing. A **field-programme onboarding** with owner OTP is strong evidence the current owner is genuine (Field Ops › Onboardings shows it). When two people claim the same place, ask both for documents via Support and decide on the stronger evidence; record the reasoning in an admin note.

## Field-programme interaction

`fieldops_flag_on_claim` flags any field onboarding whose listing someone else later claims — a possible ownership dispute or a duplicate. Check Field Ops › Review queue when you see a claim on a recently onboarded place.

## Dangerous actions

Approval is a transfer of control over a business's public presence. Never approve on a note alone. There is no "undo" in the UI: reversing a wrong approval means the previous owner files a claim that you approve.
