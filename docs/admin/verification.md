---
title: Admin — Verification
purpose: How to review a place or organizer verification request: what to look for, how to write a decision the applicant can act on, and when to revoke.
audience: Abonten reviewers, operations, support
scope: The Verification module in the admin console, the four verification permissions, and the "approve and verify" option on a place claim
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Admin — Verification

## What you are deciding

You are answering one question: **do these documents support that this business is real and that this account belongs to the people who run it?**

You are not judging whether the business is good, safe, fairly priced or legal. The badge does not say that, and you must not use the badge to reward a business you like or withhold it from one you do not.

## Before you start

Reviewing needs `verification.view`. Opening the documents needs `verification.evidence` as well — a reviewer without it sees that a document exists, its type and its size, but gets no link. Deciding needs `verification.review`. Removing a live badge needs `verification.revoke` and a fresh identity confirmation.

## The queue

Admin › Verification. Tabs for Pending, Needs info, Approved, Rejected, Revoked and Withdrawn, plus a filter for places against organizers. The tiles at the top show what is waiting.

Work Pending first, then Needs info — those are people who already answered you once.

## Reading a case

The detail page gives you, in order:

1. **A warning banner** if the place changed owner after the request was filed. Do not try to approve it; the database will refuse. Reject it and let the new owner apply.
2. **The subject** — the listing or the organizer, its current status, whether it is already verified, and how many open reports have been filed against it. A pile of open fraud reports is a reason to look harder, not an automatic refusal.
3. **The applicant** — their account, its status, the name they say is on the documents and anything they wanted you to know. Contact details appear only if you hold `users.view_pii`.
4. **The documents** — type, file name, size, and an Open link that expires after five minutes.
5. **The history** — every state change, who made it and the reason given.
6. **Internal notes** — staff only. The applicant never sees these.
7. **Earlier requests** for the same subject, so a repeat applicant's history is in front of you.

## What to look for, by document

None of these is mandatory. An applicant may send any combination, and a small business with only one of them can still be verified if it hangs together.

| Document | What makes it convincing |
|---|---|
| Business registration certificate | The registered name matches or plainly relates to the listing; the certificate is legible and not visibly altered |
| Business operating permit | Issued by the assembly for the district the listing sits in; still current |
| Sector licence | Matches the kind of business the listing claims to be |
| TIN certificate | Name matches the other documents |
| Lease or tenancy agreement | The address matches the listing's address |
| Utility bill | Recent, addressed to the business at the listing's address |
| Authorisation letter | On the business's letterhead, names the applicant, signed |
| Event permit, venue confirmation, past event material | For organizers: shows the applicant really ran the events they claim |

Two things matter more than any single document: **does the name line up across what they sent**, and **does the address line up with the listing**. A mismatch is usually a reason to ask, not to reject — people submit the wrong photo all the time.

## Writing the decision

The reason you type is **shown to the applicant word for word**. Write it as an instruction they can follow.

Good: "The operating permit you sent expired in March 2025. Send the current one, or a recent utility bill for the same address."

Bad: "Insufficient documentation." · "Docs don't check out." · "See notes."

Approve needs no reason. Rejecting and asking for more both require one, and the form will not let you submit without it.

**Ask for more information** when the applicant can plausibly fix it — wrong document, unreadable photo, missing page. **Reject** when what they sent contradicts the claim, or when they have already been asked and could not answer. A rejected applicant can always start a new request, so rejection is not a permanent door closed.

## Approving a claim and verifying together

On a place claim, "Also mark this place verified" appears when the claim carries documents, the place is not already verified, and you hold `verification.review`.

Tick it **only** when the claim's documents would have passed on their own. Approving a claim transfers ownership; that is a lower bar than verification and it is fine for the two to come apart. When you leave it unticked the new owner can apply for verification in the normal way.

## Revoking

Revoke when a badge should not have been granted, or should no longer stand: the evidence turns out to be forged, the business has closed or changed hands, or a serious report is upheld.

It takes effect immediately, the owner is notified with your reason, and the whole thing is audited. It needs a fresh identity confirmation, so expect to re-authenticate.

You do not need to revoke for a change of owner or a ban — both revoke themselves.

## What is automatic

- A verified place changing hands revokes its badge and withdraws any open request.
- Banning an organizer revokes their badge. Suspending one hides it while the suspension lasts, without touching the case.
- Editing a verified place's name, address, location or category logs an entry on its case. Nothing happens automatically; it is there so you can see it if the case comes back to you.

## Timing

Do not promise a turnaround, in the console or anywhere else. Abonten publishes no review-time target for verification, and the applicant is told only that they will be notified.

## Related

- [Architecture](../architecture/trust-and-verification.md) — the model, the state machine, storage and permissions
- [Claims](claims.md) — ownership transfer, now separate from verification
- [Roles and permissions](../architecture/roles-and-permissions.md)
