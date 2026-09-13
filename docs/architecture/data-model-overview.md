---
title: Data model overview
purpose: Orientation to the ~175 tables — grouped by domain with the key relationships, status columns, partitioning and the tables that exist but are unused.
audience: Engineering
scope: supabase/migrations (source of truth: the baseline 20260810084821_remote_schema.sql plus dated migrations)
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: no
---

# Data model overview

The schema is defined only by `supabase/migrations/`. There are **no Postgres enums**; status columns are `text` with CHECK constraints (values in `../finance/state-machines.md`). UUID defaults mix `uuid_generate_v4()` and `gen_random_uuid()` (cosmetic).

## Domains

| Domain | Core tables | Key relationships |
|---|---|---|
| Identity | `auth.users` (Supabase), `user_info`, `user_status`, `user_image_history`, `phone_otp_state`, `phone_otp_send_log`, `device_token`, `device_install` | `user_info.id = auth.users.id` (cascade) |
| Events | `event`, `event_occurrence`, `ticket_type`, `event_drafts`, `drafts`, `draft_asset_cleanup_queue`, `event_reminder`, `event_share`, `event_media` (unused) | `ticket_type.event_id`; `event.organizer_id → user_info` |
| Ticketing & payments | `ticket_checkout`, `payment_attempt`, `transaction`, `transaction_status` (lookup), `ticket`, `attendance`, `promo_code`, `promo_code_usage`, `payment_method` (partitioned), `payment_dispute` | `ticket.transaction_id`, `ticket.ticket_checkout_id`; `transaction.paystack_reference` UNIQUE |
| Organizer finance | `organizer_ledger_entry`, `payout`, `payout_account`, `receiving_account` (legacy), `platform_fee_entry`, `platform_fee_config` | ledger entries reference checkouts/transactions/payouts |
| Promotions | `event_promotion_tier`, `event_promotion_checkout`, `event_promotion`, `place_promotion_tier`, `place_promotion_checkout`, `place_promotion`, `event_promoter_commission` | activation writes `*_promotion` from a paid checkout |
| Places | `place`, `place_category`, `place_opening_hours`, `place_service`, `place_photo`, `place_drafts`, `place_claim_request`, `place_claim_document`, `place_booking`, `place_review`, `place_review_photo`, `place_analytics_event`, `place_visit_key`, `place_visit`, `place_visit_record`, `place_report` (dropped → `report`) | `place.owner_id → user_info` |
| Reviews & social | `review` (person-to-person, monthly partitions), `event_review`, `event_review_photo`, `review_drafts`, `highlight`, `favorite` (partitioned), `favorite_place`, `story` (unused) | `review.reviewed_id → user_info` |
| Messaging | `conversation`, `conversation_participant`, `conversation_block`, `message`, `message_attachment`, `message_reaction` | RPC-mediated writes |
| Reports & moderation | `report`, `report_attachment`, `report_event`, `admin_note`, `moderation_action`; `moderation_state/_at/_by/_reason` columns on content tables | `report.dedupe_key = type:id` |
| Notifications | `notification`, `notification_delivery`, `notification_delivery_config`, `notification_preference` | queue claimed by cron |
| Rewards / credit | `credit_account`, `credit_ledger_account`, `credit_journal`, `credit_entry`, `credit_lot`, `credit_reservation`, `credit_adjustment_request`, `reward_program_setting`, `reward_rule`, `reward_campaign`, `reward_budget_period`, `reward_event`, `reward_outbox`, `reward_rebate_run`, `risk_signal`, `referral_code`, `referral_touch`, `referral_attribution`, `user_referral` | no FK from credit tables to `user_info` (history outlives deletion) |
| Field programme | `fieldops_program_setting`, `fieldops_region`, `fieldops_territory`, `fieldops_campaign`, `fieldops_team`, `fieldops_team_member`, `fieldops_commission_rule`, `fieldops_assignment`, `fieldops_prospect`, `fieldops_onboarding`, `fieldops_onboarding_evidence`, `fieldops_onboarding_event`, `fieldops_commission`, `fieldops_commission_event`, `fieldops_job_run`, `fieldops_payout_batch`, `fieldops_payout_item`, `fieldops_content_brief`, `fieldops_content_submission` | member/owner ids stored without FK |
| Admin & platform | `admin_role`, `admin_permission`, `admin_role_permission`, `admin_user`, `admin_user_role`, `admin_audit_log`, `incident`, `app_error_event`, `app_error_group`, `app_request_metric`, `health_check_result`, `observability_config`, `rate_limit_bucket` | |
| Legacy / unused | `subscription`, `subscription_plan`, `subscription_checkout` (read-only history), `wallet` (partitioned, unused), `story`, `event_media`, `media_audit`, `transaction_status`, `receiving_account` | do not build on these without a decision |

## Partitioning

`review` (monthly partitions through 2026-12 + default, maintained by `ensure_future_review_partitions`), `favorite` (p1–p4), `payment_method` (p0–p3), `user_image_history` (0–3), `wallet` (p0–p3, unused), `event_media` (p0–p3, unused), `story`, `event_share`, `media_audit` (default partitions).

## Storage buckets

`place-claim-documents` (private; purged 30 days after decision), `report-attachments` (private), `message-attachments` (private), `fieldops-evidence` (private). Everything else (avatars, flyers, photos, highlights, QR) is on Cloudinary, referenced by public id + version.

## Views and materialised views

`user_profile_details` (public profile view), `app_request_metric_hourly`. Earlier documents mention an `event_search` materialised view; it never existed in this database, and the job that tried to refresh it was removed on 2026-09-13.

## Discovery

Search reads generated `search_tsv` columns on `event`, `place` and `user_info`. Opt-ins and notices: `notification_subscription`, `notification_prompt_state`, `recommendation`, `recommendation_digest`, `recommendation_digest_skip`; settings in `discovery_program_setting`; anonymous analytics in `search_query_log`. See [discovery-search-and-recommendations.md](discovery-search-and-recommendations.md).

## Where to look

Full column-level detail: `PROJECT.md §7` and the migration files. Discrepancy register: `PROJECT.md §7.6`. Replay fingerprint (tables/policies/functions/columns) is compared to production after every migration batch.
