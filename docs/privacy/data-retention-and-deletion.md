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
| Place-claim supporting documents | `purge_reviewed_claim_documents('30 days')` cron 03:00 — deletes storage objects **and** rows | 30 days after approve/reject | `20260903184813_add_place_claim_documents.sql` |
| Rate-limit buckets | `cleanup_rate_limit_buckets()` cron 04:00 | 1 day | `20260904135447_rate_limit_primitive.sql` |
| Referral click log (`referral_touch`) | `referral_purge_old_touches()` cron | 90 days | `20260911015208_referral_capture.sql` |
| Credit lots | `credit_expire_due_lots(5000)` cron 02:00 — expires the lot; ledger rows are never deleted | per-lot expiry | `20260910193609_credits_ledger_core.sql` |
| Ended events | Edge function `delete-expired-events` (daily) → `archive_or_delete_expired_event`: hard delete when no ledger/promotion history (flyer destroyed on Cloudinary), otherwise `archived_at` set and data kept | after last occurrence ends | `supabase/functions/delete-expired-events/index.ts` |
| Replaced or removed media | Explicit Cloudinary `destroy` in the mutation cores (avatar, flyer, place photos, highlights, message attachments where deleted) | immediate | `eventDraftCore`, `updateEventCore`, `updatePlaceCore`, `placePhotoCore`, `highlightDeleteCore`, `uploadHighlight.ts` |
| Dead push tokens | Pruned when Expo returns `DeviceNotRegistered`; removed on sign-out via `/api/mobile/devices/unregister` | event-driven | `sendPushNotification.ts`, `deviceTokenCore.ts` |
| Phone OTP pending state | Cleared on success, after 5 attempts, or after the 5-minute TTL | 5 minutes | `phoneOtpStore.ts` |
| Field-programme reviews left open | `fieldops_run_housekeeping()` cron 02:25 closes reviews past `review_grace_days` (14) | 14 days after campaign completion | `20260911223818_fieldops_commissions.sql` |

## 2. Account deletion (user-initiated)

Path: web `Settings › Security › Delete account` → `deleteUser.ts`; app → `POST /api/mobile/account/delete`; both → `packages/services/src/profile/deleteAccountCore.ts`.

1. `credit_close_account(user, 'user')` — pending rewards voided, balance forfeited; ledger history kept (tables have no FK to `user_info` by design).
2. `auth.admin.deleteUser(userId)` — removes the Supabase Auth user. Postgres cascades follow.

| Effect | Tables |
|---|---|
| **Deleted (cascade)** | `user_info` → `event` (+ occurrences, ticket types), `place` (+ hours, services, photos), `favorite`, `favorite_place`, `highlight`, `receiving_account`, `payout_account`, `notification_preference`, `device_token`, `event_drafts`/`place_drafts`/`review_drafts`, reviews authored (`event_review`, `place_review`, `review`), `conversation_participant` rows, `notification` rows |
| **Kept with identity nulled** (`ON DELETE SET NULL`) | `report.reporter_id`, `admin_audit_log.actor_id`, `moderation_action.actor_id`, `admin_user.created_by/disabled_by`, field-ops `created_by` columns |
| **Kept, no FK to the user** | Credit ledger (`credit_*`), `reward_event`, field-ops member/owner ids (stored without FK so history outlives the account) |
| **Kept as financial record** | `transaction`, `payment_attempt`, `ticket_checkout`, `ticket` (FK behaviour: rows reference the user; verify cascade vs restrict per table before relying on this — see gap below), `organizer_ledger_entry`, `payout`, `platform_fee_entry` |
| **Cloudinary media** | Not destroyed by the deletion path itself (avatar, flyers, photos remain on the CDN until a separate cleanup) — **gap** |

**Gaps recorded:** no grace period (decision O5); Cloudinary media of a deleted user is not purged (engineering item); the exact cascade behaviour of every money-path FK should be re-verified against `information_schema.referential_constraints` before the Privacy Policy's "kept" list is finalised (legal B9).

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
