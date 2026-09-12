---
title: Onboarding a business (place)
purpose: The five-step onboarding wizard for a place, the owner-consent rules, evidence requirements, submission gates and what happens after you submit.
audience: Field members
scope: /field/onboard/[id]
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Onboarding a business (place)

An onboarding is the record from "wizard started" to "lead decided". Your draft is kept in your browser per onboarding, so a reload does not lose it.

## Step 1 — Business and pin

Name, category, the exact **location pin**, the business phone (type it the normal Ghanaian way, e.g. 024…; the region's dial code is applied). The system runs a **duplicate search**: similar names within 300 m, or the same phone/WhatsApp number anywhere.

- A **strong** match (same phone, or very similar name nearby) is shown to you. A same-phone match cannot be onboarded again — offer [claim assistance](claim-assistance.md) instead. A strong name match must be **acknowledged** before you continue, and it is re-checked at submission and again by the eligibility sweep.

## Step 2 — Owner consent

The owner must prove consent with **their own phone**:

- **In person (offline):** enter the owner's number → a code goes to **their** phone via SMS → they type it into your screen. The number may not be yours or any team member's (refused outright), and codes are limited: 20 per hour per member, a 60-second cooldown per phone, 5 attempts, 5-minute validity.
- **Remotely (online):** send them a **consent link** (`/consent/field/…`, valid 30 minutes) to open on their own phone; the page asks for the code and shows what they are agreeing to, with a link to the Terms.

When the code is verified, an Abonten account exists for that phone (with no session — the owner signs in later with the same number), and the onboarding is pinned to that owner. Owner ≠ member and owner ∉ team are enforced by the database.

## Step 3 — Details

Description, opening hours (the same editor owners use), services, website, WhatsApp. Accuracy matters: the eligibility check later looks for a usable listing (hours, photos, pin).

## Step 4 — Photos and evidence

- **Cover and gallery photos** — uploaded to Abonten's image host under **your** signed folder; the submission is refused if the photos are not from your folder.
- **Evidence** (offline members): a **storefront** photo and an **interior** photo, taken on the spot, stored in a **private** bucket with your GPS position and accuracy. Evidence is never public; leads and admins view it through short-lived signed links.

Standards: [evidence-photo-and-content-standards.md](evidence-photo-and-content-standards.md).

## Step 5 — Review and submit

Submission gates (all must pass): owner verified; campaign active (winding-down only for fixes); daily cap not reached; photos in your folder; for offline work, your GPS position and both evidence photos; duplicate re-check acknowledged (a same-phone match is refused). On success:

1. The place is created **under the owner's account** through the normal place-creation path (so it is immediately theirs to edit).
2. Your distance to the pin and whether you were inside the territory are recorded, along with the duplicate snapshot.
3. The onboarding moves to **submitted**; your prospect (if any) becomes **converted**; your lead is notified.

## After submission

| Status | Meaning |
|---|---|
| submitted | Waiting for the lead |
| needs_changes | The lead sent it back with a note — fix and resubmit (the same place is updated, not duplicated) |
| verified | The lead approved; the commission rule and amount are **frozen**, and a **holding period** starts (7 days by default) |
| succeeded | The automatic sweep confirmed eligibility after the holding period — your commission is **approved** |
| flagged | The sweep found a soft issue (or a random spot check); an admin decides; the commission waits as pending |
| rejected | Hard failure (listing gone, unpublished, moderated away, owner changed, not the listing this onboarding created) or a lead/admin rejection — no commission |
| withdrawn | You withdrew it (allowed from draft, submitted or needs_changes) |

You are notified at each decision. Earnings: [earnings-and-payouts.md](earnings-and-payouts.md).
