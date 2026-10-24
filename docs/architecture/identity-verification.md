---
title: Identity verification — the person behind an organizer or a place
purpose: How a person proves who they are with a government ID and a live selfie, what Abonten keeps, how a document seen on two accounts is caught, what a checked identity is required for, how it ties into Safety and Trust & Verification, and how the programme is switched on.
audience: Engineering, operations, security and privacy reviewers
scope: The identity_* tables and functions, market.identity_config, user_info.identity_*, @abonten/services identity and admin/identity modules, the Smile ID adapter, the /settings/identity, /identity/done and /identity/test web routes, /api/identity/callback, /api/mobile/identity, the app's Settings › Identity verification, Admin › Identity and the identity-housekeeping job. Not covered - business documents for places and organizers, which are Trust & Verification (trust-and-verification.md).
status: Review required
version: 1.0
lastReviewed: 2026-10-24
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Identity verification

**State (2026-10-24): built, switched off, not yet connected to a live provider.** The code, the migration and the tests are in place; `identity_program_setting.enabled = false`, audience `staff`, every requirement off, and `IDENTITY_KILL_SWITCH` is available on the web deployment. Smile ID is written against its published v3 API but has not been called with a real account: the founder signs the Smile ID contract, asks Smile ID to enable Ghana (it is "available on request"), and sets the variables in §9. Until then the page says "Identity verification isn't available yet" even for staff. Legal items K1–K7 and operational decisions L1–L6 ([LEGAL_REVIEW_REQUIRED.md](../LEGAL_REVIEW_REQUIRED.md), [OPERATIONAL_DECISIONS_REQUIRED.md](../OPERATIONAL_DECISIONS_REQUIRED.md)).

## 1. Why, and how it differs from Trust & Verification

Trust & Verification ([trust-and-verification.md](trust-and-verification.md)) answers *is this account really linked to this business?* from business documents a person uploads and a reviewer reads. It says nothing about **who the person is**. When something goes wrong at an event (a fraud report, an emergency, a chargeback, a venue that never existed), Abonten needs to know which real person was behind the account, and a person banned for fraud must not come back on a new account with the same Ghana Card.

Identity verification answers that second question the way banks, ride-hailing and marketplaces do (KYC, "know your customer"): a **government ID** and a **live selfie**, checked by a specialist provider. The two programmes stack: a Verified badge can require that the person behind it has also proved who they are (§6).

| | Trust & Verification | Identity verification |
|---|---|---|
| Question | Is this account linked to this business? | Who is the person behind this account? |
| Evidence | Business documents uploaded to Abonten | Government ID + live selfie on the provider's page |
| Who checks | An Abonten reviewer | The provider (Smile ID); a reviewer only when unsure |
| Public sign | "Verified" on the place or organizer | "ID checked" beside the person's name |
| Abonten keeps | The documents (private bucket, purged) | The outcome and a few facts (§4); **never the images** |

## 2. The check, step by step

1. The person opens **Settings › Identity verification** (web or app). The page shows what is needed for what (§6), the documents their market accepts, three steps, what Abonten keeps and who sees it, and a consent box.
2. They pick a document, tick the box and press **Start the check**. `startIdentityVerificationCore` checks the programme, account restrictions, the market's documents, the provider and the limits (§7), inserts an `identity_verification` row (`created`, consent time, notice version and language recorded) and asks the provider for a **single-use hosted link** (Smile Link) that expires after `link_expiry_hours` (24 h).
3. The person goes to the provider's page (website: the same tab; app: the system browser via `openAuthSessionAsync`). They photograph the document and take a short selfie. The **Ghana Card** is checked against the National Identification Authority's record (Smile ID *Biometric KYC*: the selfie against the photo the authority holds); a **passport, driver's licence or voter ID** is checked from the document itself (*Document Verification*: security features, the selfie against the photo on it, liveness).
4. The provider sends them back: the website to `/settings/identity?checked=<id>`; the app to the public `/identity/done?v=<id>&hl=<language>`, which hands over to `abonten://settings/identity` (the app's browser has no website session; walked on Android 2026-10-24; not yet on iOS). Until the verdict arrives the page says "If you finished on the secure page, we're checking your documents now" and asks again every 5 seconds for two minutes; a browser closed without finishing leaves the check unfinished, with "Continue the check" and "Cancel".
5. The provider calls `POST /api/identity/callback/smile-id` (§5). Abonten confirms the verdict with the provider's own status API, decides (§3) and moves the attempt with `identity_transition`. The person gets a notice (in-app and push): verified, being reviewed, rejected or not finished.

An unfinished link can be reopened from the page ("Continue the check") or cancelled. Starting again for the same document reuses a link that is still good for five minutes or more.

## 3. Deciding on a verdict

`decideIdentityOutcome` (`@abonten/core/identity/rules`, unit-tested) turns the provider's verdict into one of four actions. The order matters:

| Situation | Action | The person is told |
|---|---|---|
| Provider `error` (photos unreadable, etc.) | `fail` | "The check didn't finish" + what to fix |
| Provider `block` (face mismatch, spoof, fake document) | `reject` | The matching reason (`face_mismatch`, `selfie_not_live`, `document_not_genuine`, …) |
| Under `minimum_age` (18) by the date of birth | `reject` | "You must be at least 18" |
| Document expired | `reject` | "Your document has expired" |
| The same document or person is on another Abonten account | `refer` | "Someone at Abonten is reviewing" |
| Provider `attention`, a fraud signal, or the provider's own duplicate | `refer` | Same |
| `auto_approve_clear` off | `refer` | Same |
| Otherwise (clear) | `approve` | "Your identity is verified" |

If the callback's verdict and the status API's verdict differ, the API wins and the attempt goes to review: the callback body is not covered by its signature (§5).

**Duplicates are reviewed, never auto-rejected.** A match with a banned account may be the thief's account, and the person in front of us the real owner of a stolen card. A reviewer sees the other accounts, their state and whether a check of theirs was revoked (Admin › Identity › a check).

On `approve`, `identity_transition` sets `valid_until` to the earlier of the document's expiry and `validity_months` (36), supersedes the person's previous approval, and sets the cached flags `user_info.identity_verified`, `identity_verified_at`, `identity_valid_until`, `identity_verification_id`. It refuses to approve a banned or deleted account (`identity_account_ineligible`).

## 4. Data model and what is kept

Migration `supabase/migrations/20261023100000_identity_verification.sql`. Every table has RLS on and **no** anon or authenticated privileges; every function is `service_role` only. All writes go through `@abonten/services/identity` with the service-role client after the transport has proved who is asking.

| Object | Holds |
|---|---|
| `identity_program_setting` | One row: `enabled`, `audience` (`staff`/`beta`/`all`), `beta_user_ids`, the four `require_for_*` switches, `auto_approve_clear`, `attempts_per_day` (3), `attempts_per_30_days` (6), `minimum_age` (18), `validity_months` (36), `link_expiry_hours` (24), `retention_days_unsuccessful` (365), `retention_days_after_deletion` (730), `retention_days_fraud` (1825). Ships off, audience staff, no requirements |
| `market.identity_config` | `{ provider, documents: [{ type, method }] }` in the provider's own codes; Ghana seeded with Ghana Card (`biometric_kyc`), passport, driver's licence, voter ID (`document_verification`). Parsed by `@abonten/core/identity/config`; Admin › Markets does not edit it yet, a migration does |
| `identity_verification` | One attempt: provider and job references, link, status, the provider's verdict and reason, risk level, fraud and duplicate signals, **legal name, date of birth, last four characters of the number, keyed hashes of the document and of the person, document expiry**, `is_adult`, matched accounts, the decision (source, reason, who, when), `valid_until`, consent, `account_deleted_at`. Partial unique indexes: one open attempt and one approval per person |
| `identity_verification_event` | Append-only history (a trigger refuses UPDATE): every transition with actor and reason |
| `user_info.identity_*` | The cached flags; only `identity_transition` and the account-closed trigger write them; `protect_user_info_privileged_columns` refuses client writes |

**What Abonten never keeps:** the document images, the selfie, the full document number. The images stay with Smile ID under its own retention (legal item K6). The full number is reduced to its last four characters (for staff to tell two documents apart) and a keyed hash.

**The hashes** (`@abonten/services/identity/identityHash`) are HMAC-SHA256 with `IDENTITY_HASH_SECRET`: one of country + document type + normalised number, one of the folded, sorted name words + date of birth (for someone who shows a different document). `identity_document_matches()` finds other accounts with either hash. The secret must never change: the numbers are not kept, so nothing could be re-hashed, and matches across the change would be missed.

## 5. The provider and its webhook

`packages/services/src/identity/providers/` — `types.ts` (the adapter interface), `smileId.ts`, `registry.ts`.

- **Smile ID v3.** `POST /v3/token` (JWT, reused for 10 minutes), `POST /v3/smile_links` (single-use link with `id_types`, `callback_url`, `redirect_url`, `user_id = abn_<attempt>`, `partner_params.abonten_verification_id`, the privacy-policy URL and expiry), `GET /v3/status/{job}`. Sandbox `testapi.smileidentity.com` unless `SMILE_ID_ENVIRONMENT=production`.
- **The webhook signature does not cover the body.** Smile ID signs `timestamp + partner id + "sid_request"` with the API key. So the route (`apps/web/src/app/api/identity/callback/[provider]/route.ts`, 2 MB limit, outside the proxy) accepts a callback only when the signature matches, the timestamp is within 60 minutes, and the attempt is one Abonten created; and `handleIdentityCallbackCore` then asks `GET /v3/status` for the verdict before deciding anything. Answers: 200 (done or not ours), 401 (bad signature), 503 (still processing or a failure; the provider retries).
- **The stand-in provider** (`IDENTITY_PROVIDER_OVERRIDE=test`) replaces the hosted page with `/identity/test`, where a tester picks the verdict; it runs the same decision pipeline. It is refused when `VERCEL_ENV=production` or the Supabase URL is the production project's (`testIdentityProviderAllowed`, unit-tested). Local and Preview QA only.
- **Other countries.** A market gets identity checks by listing its documents in `market.identity_config` (and the provider's codes for them). Check Smile ID's coverage for that country and document first; a market with no documents shows "not available yet". A provider for markets Smile ID does not cover is a new adapter behind the same interface.

## 6. What a checked identity is required for

Four switches, each off until decided (operational decision L2, legal K5). A requirement applies **only to people the programme is open to** (its audience): it never blocks someone who cannot verify. When the settings cannot be read, a requirement holds (fails closed, 503).

| Switch | Gate | Where |
|---|---|---|
| `require_for_payouts` | Adding a payout account; staff creating or sending a payout | `addPayoutAccountCore`, `createPayoutAdminCore`, `sendPayoutAdminCore` |
| `require_for_place_claims` | A claim being approved (the claimant) | `claimsAdminCore` |
| `require_for_verified_badges` | A Verified badge being approved (the place owner or organizer); a claim approved with "Also mark verified" | `verificationAdminCore`, `claimsAdminCore` |
| `require_for_paid_events` | Creating an event with a priced ticket tier, or adding a price later | `postEventCore`, `updateEventTicketTypesCore` |

A refused action answers 409 with `identity.required.<purpose>` ("Verify your identity before you add a payout account. Go to Settings › Identity verification."); free events stay open to everyone.

## 7. Limits and abuse

- `attempts_per_day` (3) and `attempts_per_30_days` (6) per person, cancelled attempts not counted: each attempt is a paid provider check.
- A restricted (suspended or banned) account cannot start a check.
- One open attempt and one approval per person (unique indexes).
- The test provider is refused in production (§5).
- Age: under 18 is rejected whatever the provider says.

## 8. Public signs, Safety and staff

**The "ID checked" badge** (`identity.badgeLabel`, explanation `identity.badgeExplanation`, `@abonten/core/identity/copy`) shows beside an organizer's name on the event page and the public profile (web `IdentityCheckedBadge`, app `IdentityCheckedPill`), only for a live check on an active account. Tapping it says Abonten checked a government ID and a live selfie, and that this does **not** mean Abonten vouches for the person, their events or places (legal K3). Nothing from the document is ever public. `get_public_profile` returns `identity_verified` (already folded with the expiry).

**Safety.** When a person's alert is tied to an event, their trusted contacts' live page (`/sos/<token>`, app watch screen) shows, while the session is open, who runs the event (their public profile name and the "ID checked" badge) and the venue's own public phone and WhatsApp numbers from its Abonten page, so a contact can ring the people on site. **The organizer's legal identity is never shared with contacts.** It stays with Abonten: staff with `identity.view_pii` can look it up behind a reason and a fresh re-auth, every look is in the audit log, and disclosure to the police follows the law-enforcement process (legal K4). This is decision L6.

**Staff** (Admin › Identity, [admin/identity.md](../admin/identity.md)). Permissions: `identity.view` (list, status, signals; no personal details), `identity.view_pii` (name, date of birth, last four, expiry — step-up, reason, audited as `identity.pii.view`), `identity.review` (decide a check in review), `identity.revoke` (take a live check away — step-up), `identity.configure` (settings — step-up). Seeded: operations all five; moderator view + review; finance_admin and support_admin view. Admin › Users and Admin › Finance › Payouts show each person's identity status (no details).

## 9. Configuration

| Variable | Where | Meaning |
|---|---|---|
| `SMILE_ID_PARTNER_ID` | web (server) | Smile ID partner id (digits) |
| `SMILE_ID_API_KEY` | web (server), secret | Signs tokens and verifies webhooks |
| `SMILE_ID_ENVIRONMENT` | web (server) | `production` for the live API; anything else is the sandbox |
| `IDENTITY_HASH_SECRET` | web (server), secret | At least 32 characters; **never rotate** (§4). Without it nothing can start |
| `IDENTITY_KILL_SWITCH` | web and admin | `true` closes the programme and every requirement; the console checks requirements on staff payout, claim and badge approvals, so set it on both |
| `IDENTITY_PROVIDER_OVERRIDE` | Preview / local only | `test` uses the stand-in provider |

Smile ID's dashboard needs the callback URL `https://abontenhub.com/api/identity/callback/smile-id` (and the Preview one for its sandbox).

## 10. Account deletion and retention

Account deletion is a soft delete (`user_info` stays, status 4), so `on delete cascade` never fires. The trigger `user_info_identity_account_closed` (before update of `status_id`) clears the flags, cancels open attempts and stamps `account_deleted_at`; the record is kept so a deleted account can still be traced after an incident. The daily `identity-housekeeping` job (pg_cron `10 4 * * *`, `identity_housekeeping()`):

- expires links nobody finished (a day after the link's own expiry) and checks the provider never answered (14 days);
- expires approvals past `valid_until`;
- deletes records tied to fraud (revoked, blocked, fraud signal, matched another account) `retention_days_fraud` (5 years) after the decision;
- deletes a deleted account's other records `retention_days_after_deletion` (2 years) after deletion;
- deletes rejected, failed, expired and cancelled attempts `retention_days_unsuccessful` (1 year) after their last change, unless one is still the person's live record.

These periods are proposals for counsel (legal K2).

## 11. Code map

| Layer | Files |
|---|---|
| Rules (framework-free) | `packages/core/src/identity/{rules,config,copy}.ts` (+ `identity.test.ts`) |
| Types and validation | `packages/types/src/identityType.ts`, `packages/validation/src/identitySchemas.ts` |
| Services | `packages/services/src/identity/{identityCore,identityProgram,identityHash}.ts`, `providers/*` (+ `smileId.test.ts`), `admin/identity/identityAdminCore.ts` |
| Web | `apps/web/src/actions/identity/*`, `app/[locale]/(pages)/(settings)/settings/identity`, `app/[locale]/(pages)/identity/{done,test}`, `app/api/identity/callback/[provider]`, `app/api/mobile/identity/**`, `src/identity/**` |
| App | `apps/mobile/app/(app)/settings/identity.tsx`, `src/features/identity/useIdentity.ts`, `src/components/identity/IdentityCheckedPill.tsx` |
| Console | `apps/admin/src/app/(console)/identity/**`, `src/server/actions/identity.ts` |
| Tests | `packages/services/src/__integration__/identity.integration.test.ts` (tables locked, each verdict, duplicates, staff decisions and reveal audit, requirements, deletion, housekeeping), `function-grants.integration.test.ts` |

## 12. Rollout

1. **Founder:** sign with Smile ID, ask for Ghana Biometric KYC and Document Verification, put the partner id and API key (sandbox first) and `IDENTITY_HASH_SECRET` on Preview, then Production; set the callback URL in the Smile ID dashboard.
2. **Staff test on Preview** with the sandbox, then on Production with real documents of staff (programme on, audience `staff`).
3. **Pilot testers as `beta`** once K1–K3 and K6 are Decided and the privacy policy carries the identity section.
4. **Requirements** one at a time (L2): payouts first, before live Paystack keys; then place claims and Verified badges; paid events last.
5. **Everyone** with the help page listed.
