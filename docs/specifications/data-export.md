---
title: Specification — personal-data export (access requests)
purpose: Document the current limitation (manual export only), the interim workflow staff must follow, and the proposed self-service export so it can be built once the response standard is confirmed.
audience: Legal counsel, founder, support staff, engineering
scope: Access requests under Act 843; all tables in the data inventory; web and mobile settings
status: Draft
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Specification — personal-data export (access requests)

## 1. Current limitation

- There is **no self-service export** on the web or in the app, and no admin-console action to produce one.
- The Privacy Policy (§11) states that access requests are handled manually.
- The manual procedure is [../privacy/privacy-rights-operations.md](../privacy/privacy-rights-operations.md) §1: verify the request came from the user's own support conversation, locate the data using the data inventory, have an engineer with service-role access run read-only queries per table for that user id, review the file for third-party data, deliver it through the support conversation, record it as an admin note.
- Statutory response time and identity-verification standard are open (legal B5, decision O2); the interim working assumption in the procedure is acknowledgement within 3 working days and completion within 30 days — **an interim practice, not a confirmed obligation**.

## 2. Interim workflow (in force now)

Received → Verify (signed-in support conversation) → Locate ([../privacy/data-inventory.md](../privacy/data-inventory.md) §1–§9) → Assess (exclude other people's data: the other side of conversations, other reviewers, staff notes and risk flags) → Execute (engineer query per table) → Record (admin note) → Respond (file through the support conversation) → Escalate (founder, if disputed).

Staff may not open message threads other than support and reported conversations; message content for an export is pulled by the engineer's query, not by browsing.

## 3. Proposed self-service export

**User-facing.** Settings › Privacy › "Download my data" (the web Settings pages and the mobile Settings hub). One request at a time; the user is told the export is being prepared and notified when ready; the file is available for a limited time behind a signed URL.

**Backend (follows the shared-backend rule: logic in `@abonten/services`, thin web action and `/api/mobile` twin).**

1. `data_export_request` table: `id`, `user_id`, `status` (`requested | processing | ready | failed | expired`), `requested_at`, `completed_at`, `expires_at`, `file_path`, `error`. RLS: the owner may select their own rows; inserts and updates only through a service function.
2. `requestDataExportCore(supabase, userId)` — refuses if a request is already open; inserts the row; enqueues work.
3. Worker — either a route called by a pg_cron job (the pattern already used for notification delivery: a config row holding the deployment URL and a token, never an env var) or a Supabase Edge Function. It assembles one JSON document per data category from the inventory, using the service-role client, and **excludes** other users' personal data and staff-only material (admin notes, risk scores, moderation reasons written for staff).
4. Storage — a private bucket `user-exports` with a per-user folder; a signed download URL valid for a fixed period; a purge job removes files at `expires_at` (add this data set to the retention specification).
5. Notification — an in-app notification and, if the user has an email, an email through the existing delivery queue, saying the export is ready.
6. Audit — an `admin_audit_log`-style record is not appropriate (no admin actor); instead the `data_export_request` row is the record.

**Contents (mapped to the inventory).** Profile and settings; contact details; sign-in identities (provider names, not tokens); events, places and highlights the user created; favourites; tickets and transactions; payment methods as displayed (masked, never authorization codes); reviews written; messages sent by the user (the user's own messages and attachments only); reports filed (without staff notes); notifications; rewards ledger entries and referral records; field-programme membership and payouts if applicable; device registrations; consent records if any exist by then.

**Format.** JSON (machine-readable) plus a short README explaining the files. A CSV per table can be added later.

## 4. Edge cases

- Suspended or banned users: the request must still be possible (from the restricted-account page or through support) — confirm with counsel (B5).
- Deleted accounts: no export after deletion; the help page tells users to export first once the feature exists.
- Organizers: attendee lists are **not** part of an organizer's export (that is other people's data); their own ledger is.

## 5. Approval required before implementation

| Item | Decision needed | Register |
|---|---|---|
| Statutory response timeline and whether a self-service export must be offered | Counsel confirms | Legal B5 |
| Identity-verification standard, including for locked-out users | Founder / counsel | Decision O2 |
| Build the self-service export | Founder approves the engineering work | Decision O3 |
| Retention of export files | Set alongside R1–R9 | Retention decisions |

**Status: not approved. The manual procedure remains the only path until O3 is Decided.**
