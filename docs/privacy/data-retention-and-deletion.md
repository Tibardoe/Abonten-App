---
title: Data retention and deletion
purpose: State, for every data category, how long it is kept, what deletes or expires it (and by which job or code path), and where no policy exists yet.
audience: Privacy reviewer, engineering, operations
scope: Production data in Supabase, Supabase Storage, Cloudinary and provider systems
status: Review required
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: yes
---

# Data retention and deletion

**Rule of this document:** a retention value is stated only where a job, trigger, cascade or code path actually enforces it. Everywhere else the value is **POLICY DECISION REQUIRED** and the row is in `../OPERATIONAL_DECISIONS_REQUIRED.md` (R-numbers).

## 1. Automatic expiry and purge jobs that exist

| Data | Mechanism | Period | Source |
|---|---|---|---|
| Pending ticket checkouts | `expire_stale_ticket_checkouts()` (pg_cron every 5 min) releases inventory and marks rows expired | 30 minutes (`CHECKOUT_RESERVATION_MINUTES`) | `packages/core/src/checkoutExpiry.ts`, migrations |
| Promotion / subscription checkouts | Matching `expire-*` cron jobs | Same pattern | migrations |
| Expired credit reservations | `credit_release_stale_reservations` sweep | per reservation TTL | `20260910215010_credit_reservations.sql` |
| Drafts (events, places, reviews) | `cleanup_expired_drafts()` cron; `draft_asset_cleanup_queue` → Cloudinary destroy | on `expires_at` | `20260818090100_add_drafts_cleanup_cron.sql`, `cleanupOrphanedDraftAssets.ts` |
| Place-claim supporting documents | `purge_reviewed_claim_documents('30 days')` cron 03:00 — deletes the rows and queues the bucket objects in `storage_purge_queue`; the `storage-purge-dispatch` cron (every 10 min) has `POST /api/maintenance/storage-purge` delete them through the Storage API (until 2026-09-13 the job deleted from `storage.objects` directly, which Supabase refuses — it had failed nightly and removed nothing) | 30 days after approve/reject | `20260903184813_add_place_claim_documents.sql`, `20260913200000_storage_purge_queue.sql` |
| Verification evidence | `purge_verification_evidence()` cron 03:30 — same queue + Storage API path as above | `retention_days_unapproved` / `retention_days_after_revoke` | `20260912120000_trust_verification.sql`, `20260913200000_storage_purge_queue.sql` |
| Rate-limit buckets | `cleanup_rate_limit_buckets()` cron 04:00 | 1 day | `20260904135447_rate_limit_primitive.sql` |
| Referral click log (`referral_touch`) | `referral_purge_old_touches()` cron | 90 days | `20260911015208_referral_capture.sql` |
| Credit lots | `credit_expire_due_lots(5000)` cron 02:00 — expires the lot; ledger rows are never deleted | per-lot expiry | `20260910193609_credits_ledger_core.sql` |
| Ended events | Edge function `delete-expired-events` (daily) → `archive_or_delete_expired_event`: hard delete when no ledger/promotion history (flyer destroyed on Cloudinary), otherwise `archived_at` set and data kept | after last occurrence ends | `supabase/functions/delete-expired-events/index.ts` |
| Replaced or removed media | Explicit Cloudinary `destroy` in the mutation cores (avatar, flyer, place photos, highlights, message attachments where deleted) | immediate | `eventDraftCore`, `updateEventCore`, `updatePlaceCore`, `placePhotoCore`, `highlightDeleteCore`, `uploadHighlight.ts` |
| Dead push tokens | Pruned when Expo returns `DeviceNotRegistered` in the send ticket or the receipt; removed on sign-out via `/api/mobile/devices/unregister` | event-driven | `sendPushNotification.ts`, `pushReceiptsCore.ts`, `deviceTokenCore.ts` |
| Push receipts waiting to be read | Deleted once read; unread rows dropped after one day | every minute | `run_notification_delivery()`, `pushReceiptsCore.ts` |
| Browser push subscriptions | Removed on sign-out and opt-out; deleted on a 404/410 from the push service | event-driven | `webPushCore.ts`, `useWebPush.ts` |
| Phone OTP pending state | Cleared on success, after 5 attempts, or after the 5-minute TTL | 5 minutes | `phoneOtpStore.ts` |
| Field-programme reviews left open | `fieldops_run_housekeeping()` cron 02:25 closes reviews past `review_grace_days` (14) | 14 days after campaign completion | `20260911223818_fieldops_commissions.sql` |

## 2. Account deletion (user-initiated)

Path: web `Settings › Security › Delete account` → `deleteUser.ts`; app → `POST /api/mobile/account/delete`; both → `packages/services/src/profile/deleteAccountCore.ts`.

Since 2026-09-13 (migration `20260913200100_account_deletion_preserves_records`) deletion is an **anonymising soft delete**. The previous path hard-deleted the Auth user and let `ON DELETE CASCADE` remove the person's transactions, tickets, ledger entries, payouts and fee entries, and every event they organized together with other people's tickets for those events; that was verified against the live foreign keys on 2026-09-13 and closed.

1. `account_deletion_blockers(user)` — deletion is **refused (HTTP 409)** while the person still has an upcoming published event with attendees, a payout in `processing`, earnings not yet paid out, or admin roles. The message tells them which step to take first.
2. `credit_close_account(user, 'user')` — pending rewards voided, balance forfeited; ledger history kept.
3. `anonymize_deleted_account(user)` — see the table.
4. `auth.admin.deleteUser(user, shouldSoftDelete = true)` — Supabase Auth revokes every session, removes identities and MFA factors, obfuscates the email and phone, and keeps the `auth.users` row with `deleted_at` set. Nothing cascades. The same email or number can sign up again as a new account.

| Effect | Tables |
|---|---|
| **Anonymised** | `user_info`: name "Deleted user", username `deleted_<id prefix>`, avatar, bio, website and organizer-verified flags cleared, `status_id` 4 (Deleted) |
| **Deleted** | `device_token`, `web_push_subscription`, `favorite`, `favorite_place`, `event_reminder`, `notification` (+ `notification_delivery`), `notification_preference`, `notification_subscription`, `user_image_history`, `receiving_account`, `highlight`, `drafts` (+ `event_drafts`/`place_drafts`/`review_drafts`), pending `place_claim_request` (+ documents; the bucket objects go to `storage_purge_queue`), draft events |
| **Scrubbed shells** (rows are referenced by payment attempts / payouts) | `payment_method` → `removed`, details reduced to brand/last4/network/bank (the Paystack authorization code is gone); `payout_account` → `removed`, holder name and number replaced |
| **Events** | Upcoming published events with no active tickets → `canceled`; everything else `archived_at` set (leaves discovery and search; direct links still open, organizer shown as "Deleted user") |
| **Places** | Kept published, `claimed = false`, verification cleared — the next owner can claim the listing |
| **Verification cases** | Open cases withdrawn, an approved one revoked (`verification_transition`, actor `system`, reason `account_deleted`) |
| **Kept with identity nulled** (`ON DELETE SET NULL`) | unchanged — nothing is deleted from `auth.users`, so these columns keep their ids and resolve to the anonymised profile |
| **Kept, no FK to the user** | Credit ledger (`credit_*`), `reward_event`, field-ops member/owner ids |
| **Kept as financial record** (verified cascade would have removed them) | `transaction`, `payment_attempt`, `ticket_checkout`, `ticket`, `organizer_ledger_entry`, `payout`, `platform_fee_entry` — all now point at the anonymised profile |
| **Kept as content** | Reviews authored (`event_review`, `place_review`, `review`) and messages sent, shown as "Deleted user" |
| **Cloudinary media** | Not destroyed by the deletion path itself (avatar, flyers, photos remain on the CDN until a separate cleanup) — **gap** |

**Gaps recorded:** no grace period (decision O5); Cloudinary media of a deleted user is not purged (engineering item); reviews and messages are kept anonymised rather than deleted — confirm with counsel (legal B9).

## 3. Admin-initiated actions

- **Suspend / ban** (`setUserStatusCore`) changes `user_info.status_id`, revokes all sessions (`auth.admin.signOut(user, 'global')`), audits. Deletes nothing.
- **Moderation** (`apply_moderation_action`) sets `moderation_state` — hidden/removed content stays in the database.
- Admins have **no** "delete user data" tool; a privacy deletion request is fulfilled by the user's own delete-account action or, if the user cannot sign in, by an engineer with service-role access following `privacy-rights-operations.md`.

## 4. No retention policy exists (POLICY DECISION REQUIRED)

| Data | Today | Register |
|---|---|---|
| `transaction`, `ticket`, `ticket_checkout`, `payment_attempt` (after deletion or after the event) | Indefinite | R1 |
| `organizer_ledger_entry`, `payout`, `platform_fee_entry`, credit ledger | Indefinite, append-only | R2 |
| Messages, attachments, reactions | Indefinite; no user-initiated conversation deletion | R3 |
| `notification`, `notification_delivery` | Indefinite | R4 |
| `phone_otp_send_log` | Indefinite | R5 |
| `app_error_event`, `app_error_group`, `app_request_metric`, `health_check_result`, `incident` | Indefinite | R6 |
| Field evidence (`fieldops-evidence` bucket) | `evidence_retention_days = 365` is only **counted** by housekeeping (`evidence_due_for_purge`), never deleted | R7 |
| `report`, `report_attachment`, `report_event` after resolution | Indefinite | R8 |
| `admin_audit_log` | Permanent by design (append-only, no delete grant) | R9 (confirm) |
| Sentry events | Per Sentry plan retention | — |

## 5. Backups

Supabase manages database backups for the project; the retention of those backups is governed by the Supabase plan and is outside the application's control. Deleted data may persist in backups until they rotate. **Backup retention period: NOT DETERMINED FROM CODE — confirm in the Supabase dashboard and record here.**

## 6. Legal holds

There is no legal-hold mechanism. If a record must be preserved beyond a deletion, an engineer must export it before the deletion runs. (Decision to add a hold flag is with the founder.)
