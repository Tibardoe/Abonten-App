---
title: Trust & Verification architecture
purpose: How Abonten verifies places and event organizers — the data model, the state machine, document storage, permissions and the automatic revocation rules.
audience: Engineering, operations, security reviewers
scope: verification_case and its companion tables, the verification-evidence bucket, the admin review module, the owner-facing flows on web and mobile, and the relationship to place claims
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Trust & Verification architecture

## 1. What "verified" means, and what it does not

A Verified badge on Abonten means one thing: **Abonten reviewed documents supporting the business's registration and the link between that business and the account that manages the listing.**

It is not a statement about the business's service, prices, safety, legality or quality. That wording is fixed in code, in `packages/core/src/verification/copy.ts`, and every surface — web, mobile, the badge popover, the help centre — reads it from there so the claim cannot drift. Counsel has not yet confirmed the wording: legal item **H3**.

## 2. Why this exists

Before 2026-09-12 `place.verified` was a boolean with no lifecycle. It was set only as a side effect of `approve_place_claim`, which meant:

- A place its owner created themselves could never be verified — there was nothing to claim.
- A web claim required no documents at all, yet approving one produced a Verified badge.
- Abonten Rewards already paid money on the flag (the venue rebate and place-visit credit both require `place.verified`), so it carried financial weight with no evidence trail behind it.
- Organizers had no trust signal of any kind.

## 3. The model

| Table | What it holds |
|---|---|
| `verification_case` | One request. Typed subject: `place_id` **or** `organizer_user_id`, never both, matching `subject_type`. `subject_id` is a stored generated column over the two. |
| `verification_evidence` | Metadata for one document. The bytes live in the private bucket; this row holds the path, type, size and upload state. |
| `verification_event` | Append-only history. A trigger refuses UPDATE and DELETE. |
| `verification_program_setting` | One row of switches. Ships with everything off. |
| `verification_evidence_type` | The evidence categories. Adding one is an INSERT, not a code change. |

Cached flags the product reads: `place.verified` / `verified_at` / `verification_case_id`, and `user_info.organizer_verified` / `organizer_verified_at` / `organizer_verification_case_id`. Only `verification_transition()` writes them; the `guard_staff_managed_columns` and `protect_user_info_privileged_columns` triggers refuse a direct client write to any of them.

Internal reviewer notes are **not** in these tables. They go to the existing immutable `admin_note` with `target_type = 'verification_case'`, which clients cannot read at all.

## 4. The state machine

```
draft ──submit──▶ pending_review ──approve──▶ approved ──revoke──▶ revoked
  │                  │  ▲                       (admin / system)
  │                  │  └──resubmit── needs_info ◀──request_info──┘
  │                  ├──reject──▶ rejected        needs_info ──reject──▶ rejected
  └──withdraw──▶ withdrawn ◀──withdraw── pending_review | needs_info
```

"Not started" is the absence of a case. `rejected` and `revoked` are deliberately different: one is a request that was never granted, the other a badge taken away after it was live.

**`verification_transition()` is the only thing that moves a case.** It is `SECURITY DEFINER`, executable by `service_role` only, and it:

- locks the **subject first, then the case**, so it cannot deadlock with `approve_place_claim` (which locks claim → place → case through the trigger);
- validates `(status, action, actor_kind)` against the same table `packages/core/src/verification/stateMachine.ts` mirrors;
- re-checks at `submit` and `approve` that the place is still published, not hidden or removed, and still owned by the applicant — and that an organizer's account is still active;
- refuses to submit without at least one confirmed document, and to reject, ask for more or revoke without a reason;
- applies the cached flags and writes the history row itself.

Because every path goes through it, two reviewers acting at once, an approval after the applicant withdrew, and an approval of a place that changed hands in the meantime are all settled by the database rather than by whichever request arrives first.

## 5. Evidence storage

Bucket `verification-evidence`: private, 10 MB per file, images and PDF only.

It has **no `storage.objects` policies**, following the Field Ops evidence pattern. Uploads use a signed upload URL the service mints only after checking the caller owns the case; reads use a five-minute signed URL minted only for an admin holding `verification.evidence`. A document URL is never given to the applicant, and never logged.

`purge_verification_evidence()` runs nightly at 03:30 (pg_cron). It withdraws stale drafts, deletes the bytes and marks the rows purged once a case passes its retention window, removes objects orphaned by a deleted subject, and clears upload tickets that were never used. The retention periods are settings, not constants — see decision **V1**.

## 6. Permissions

| Key | Grants |
|---|---|
| `verification.view` | The queue, and a case's metadata and history |
| `verification.evidence` | Opening the submitted documents |
| `verification.review` | Approve, reject, ask for more information; also "approve and verify" on a claim |
| `verification.revoke` | Removing a live badge — in `STEP_UP_PERMISSIONS`, so it needs a fresh re-auth |

Seeded to: operations (all four), moderator (view, evidence, review), support_admin / analyst / field_ops_manager (view). super_admin holds everything by rule. Who should actually review is decision **V2**.

Opening a document is a separate permission from deciding on purpose: a reviewer can triage a queue without every admin role gaining access to other people's business paperwork.

## 7. Access model

The four verification tables carry no `anon` or `authenticated` privileges and have a deny-all policy. Nothing reaches a client directly — not even a requester's own case.

That is deliberate. The case row carries `reviewed_by` and `revoked_by`, and the history carries admin `actor_id`; an owner-scoped read policy would hand a requester the identity of the Abonten staff member who judged them. Instead every read goes through `@abonten/services/verification`, which checks ownership and returns a DTO with the reviewer fields stripped. Mobile therefore uses the HTTP API for verification rather than reading Supabase directly, unlike place claims.

## 8. Relationship to place claims

Approving a claim now transfers **ownership only**. It sets `owner_id` and `claimed`; it no longer sets `verified`.

A reviewer who judges a claim's attached documents good enough can tick "Also mark this place verified", which calls `approve_place_claim_and_verify()` — one transaction that does both and opens an approved case recording the claim it came from. That option needs `verification.review` on top of `claims.review`.

Existing verified places were backfilled as approved cases with `source = 'legacy_claim'` when the migration ran.

## 9. What happens automatically

| Event | Behaviour |
|---|---|
| A verified place changes owner | System revoke (`owner_changed`); any open case is withdrawn. The new owner starts fresh. |
| A verified organizer is banned | System revoke (`account_banned`). |
| An organizer is suspended | The badge is hidden while the account is not active; the case is untouched. |
| A verified place's name, address, location or category is edited | A `subject_changed` event is logged for the reviewer to see. No automatic action — decision **V4**. |
| A place is archived or unpublished | The verification is kept; the badge is simply not visible, and a new request cannot be submitted. |
| A place or organizer is deleted | Cases and evidence rows cascade; the purge job removes the orphaned objects. |
| Fraud found after approval | An admin revokes with a reason, behind step-up, audited and notified. The applicant may reapply. |

## 10. Notifications

Five types, written through `createNotificationCore` so each is an in-app notice and a push: `verification_submitted`, `verification_approved`, `verification_info_requested`, `verification_rejected`, `verification_revoked`. The reason the reviewer typed is the body of the last three, so an applicant always learns what to fix. No email in this phase — the delivery queue's email lane is rewards-only today.

## 11. Rollout state

Ships **off**. `verification_program_setting` has `place_requests_enabled` and `organizer_requests_enabled` false and `audience = 'staff'`; `VERIFICATION_KILL_SWITCH=true` overrides the table entirely. Places already verified keep their badge either way — the switches gate new requests, not existing badges.

The programme resolver fails closed: a missing settings row or a failed read yields the all-off programme.

## 12. Observability

Failures log the case id and subject id only — never a file name, a note, or document contents. Admin Server Action failures reach the `abonten-admin` Sentry project through `captureAdminActionError`. The transition RPC raises stable message keys (`verification_invalid_transition`, `verification_subject_ineligible`, and so on) which the service maps to HTTP statuses in one place, so an expected conflict is not reported as a server error.

## 13. Open items

- **V1** evidence retention periods · **V2** who reviews · **V3** whether individual organizers may apply · **V4** reverification after a material change · **V5** cooldown after rejection — [../OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md)
- **H1** which Ghanaian documents may be requested and stored · **H2** retention under Act 843 · **H3** badge wording — [../LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md)

## 14. Where the code lives

| Layer | Path |
|---|---|
| Migration | `supabase/migrations/20260912120000_trust_verification.sql` |
| State machine and copy | `packages/core/src/verification/` |
| Types | `packages/types/src/verificationType.ts` |
| Schemas | `packages/validation/src/verificationSchemas.ts` |
| Owner services | `packages/services/src/verification/` |
| Admin services | `packages/services/src/admin/verification/verificationAdminCore.ts` |
| Web actions | `apps/web/src/actions/verification/` |
| Mobile API | `apps/web/src/app/api/mobile/verification/` |
| Web UI | `apps/web/src/verification/` |
| Mobile UI | `apps/mobile/src/components/verification/`, `apps/mobile/src/features/verification/` |
| Admin UI | `apps/admin/src/app/(console)/verification/` |
| Tests | `packages/core/src/verification/stateMachine.test.ts`, `packages/services/src/verification/*.test.ts`, `packages/services/src/__integration__/verification.integration.test.ts` |
