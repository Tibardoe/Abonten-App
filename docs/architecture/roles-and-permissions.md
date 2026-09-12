---
title: Roles and permissions (technical reference)
purpose: The complete role model as enforced — how end-user roles are derived, the admin RBAC data, field roles, account status, and the RLS summary per table.
audience: Engineering, security/compliance reviewers
scope: user_info, admin_* tables, fieldops_team_member, RLS policies in supabase/migrations
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: no
complianceReviewRequired: yes
---

# Roles and permissions (technical reference)

## End users — roles are derived, not stored

| Role | Derivation | Notes |
|---|---|---|
| Customer | any `auth.users` row → `user_info` (trigger `create_user_info_if_not_exists`, `status_id = 1`) | |
| Organizer | `event.organizer_id = auth.uid()` | `useIsOrganizer` (web) shows organizer nav; no payout account needed to publish |
| Place owner | `place.owner_id = auth.uid()`; `claimed`, `verified` flags set only by `approve_place_claim` | client writes to the flags refused by `guard_staff_managed_columns` |
| Field team member / lead | `fieldops_team_member` (role, status); never an `admin_user` | `resolveFieldOpsContext` |
| Staff | `admin_user.status = 'active'` + `admin_user_role`; `user_info.is_admin` synced by trigger | `is_staff()`, `is_admin()` helpers |

Account status: `user_info.status_id` → `user_status` (1 Active, 2 Suspended, 3 Banned). Enforcement: web proxy redirect, `getMobileAuth` 403, review-reply core; sessions revoked globally on change. No RLS policy keys off status.

## Admin RBAC

Tables `admin_role`, `admin_permission`, `admin_role_permission` (live matrix), `admin_user`, `admin_user_role` — all service-role only. `resolveAdminContext` (services) reads the matrix per request with fallbacks to the compiled seed (`@abonten/core/adminPermissions.ts`). 55 keys, 7 roles, 13 step-up permissions — full lists in `../admin/settings-and-rbac.md`. Step-up token: `admin/stepUpToken.ts` (HMAC over `userId:ms`, purpose `admin-stepup:v1`, 10 min).


### Verification permissions (2026-09-12)

Four keys, deliberately separated so triaging a queue does not hand every admin role access to other businesses' paperwork:

| Key | Grants | Seeded to |
|---|---|---|
| `verification.view` | The queue, case metadata and history | operations, moderator, support_admin, analyst, field_ops_manager |
| `verification.evidence` | Opening the submitted documents (5-minute signed links) | operations, moderator |
| `verification.review` | Approve / reject / request more information; "approve and verify" on a claim | operations, moderator |
| `verification.revoke` | Removing a live badge — in `STEP_UP_PERMISSIONS` | operations |

super_admin holds all four by rule. Detail: [trust-and-verification.md](trust-and-verification.md); who *should* hold them is decision V2.
## Field roles

`team_lead`, `content_creator`, `offline_member`, `online_member`; membership status `invited/active/suspended/left`. Boundaries in `../field-operations/roles-and-permissions.md`.

## RLS summary (who can SELECT / INSERT / UPDATE / DELETE)

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `user_info` | public | trigger only | self (privileged cols guarded) / admin | — |
| `event` | organizer, or published/canceled & not hidden/removed | organizer | organizer (moderation cols guarded) | organizer |
| `ticket_type` | public for published events | organizer | organizer | organizer |
| `ticket` | buyer, or event organizer | server (RPC) | buyer / organizer (check-in) | — |
| `attendance` | buyer / organizer | server | server | — |
| `ticket_checkout`, `payment_attempt`, `transaction`, `*_promotion_checkout`, `*_promotion`, `promo_code_usage`, `subscription*` | owner (read) | **none** (server only) | **none** | **none** |
| `promo_code` | any authenticated (row-unrestricted, by design) | organizer | organizer; buyers may change only `times_used` (guard) | organizer |
| `payment_method` | owner | owner | owner | owner |
| `place` | owner, or published & not hidden/removed | owner (flags guarded) | owner; admin (`place_admin_update`) | owner |
| `place_opening_hours`, `place_service`, `place_photo` | public with place | owner | owner | owner |
| `place_claim_request` | claimant / admin | claimant (one pending) | admin | — |
| `place_claim_document` | claimant / admin (private bucket) | claimant | — | purge job |
| `place_booking` | customer / owner | customer | customer / owner | — |
| `review` (person), `event_review`, `place_review` (+photos) | approved & not hidden, or author, or organizer/owner | author | author; organizer/owner response columns only | author |
| `highlight` | not hidden/removed, or owner | owner | owner | owner |
| `favorite`, `favorite_place` | owner | owner | owner | owner |
| `conversation`, `conversation_participant` | participant / staff | RPC | RPC (no self-update on participant) | RPC |
| `message`, `message_attachment` | participant & visible, or sender, or staff | RPC | RPC | RPC |
| `message_reaction` | participant | own | — | own |
| `conversation_block` | own | own | — | own |
| `notification` | owner | **none** (system) | owner (read state) | — |
| `notification_preference` | none (service role) | — | — | — |
| `device_token` | owner | owner (via route) | — | owner |
| `report` | reporter / staff | reporter | **none** | **none** |
| `report_attachment` | reporter / staff | reporter | — | — |
| `report_event`, `admin_note`, `moderation_action` | service role | service role | — (note immutable) | — |
| `organizer_ledger_entry` | organizer (own) | none (RPC) | — | — |
| `payout` | organizer (own) | RPC | admin RPC | — |
| `payout_account`, `receiving_account` | owner | owner | owner | owner |
| `platform_fee_entry`, `platform_fee_config` | service role (rate via RPC) | RPC | — | — |
| `credit_account`, `credit_lot`, `credit_reservation` | owner | functions | functions | — |
| `credit_ledger_account`, `credit_journal`, `credit_entry` | none for clients; SELECT-only even for service role | functions | append-only | append-only |
| `reward_event`, `reward_outbox`, `risk_signal`, `reward_*` config | engine / staff | engine | engine | engine |
| `referral_code` | owner | service | service | — |
| `user_referral` | referee | service | service | — |
| `referral_touch` | none | service | — | purge job |
| `place_visit*` | own | service (rate-limited) | — | — |
| `event_promoter_commission` | promoter / organizer | engine | engine | — |
| `fieldops_campaign/region/territory/team` | campaign member | none | none | none |
| `fieldops_team_member` | self / lead (payout cols revoked) | none | none | none |
| `fieldops_assignment`, `fieldops_prospect`, `fieldops_onboarding*`, `fieldops_commission*`, `fieldops_content*` | self / lead / campaign (briefs) | none | none | none (commission: no DELETE even for service role; events append-only) |
| `fieldops_payout_item` | self | none | none | none |
| `fieldops_program_setting`, `fieldops_commission_rule`, `fieldops_job_run`, `fieldops_payout_batch` | deny-all policy | — | — | — |
| `admin_*`, `admin_audit_log`, `rate_limit_bucket`, `phone_otp_*`, `app_error_*`, `app_request_metric`, `health_check_result`, `incident`, `observability_config`, `notification_delivery*` | service role only | service role | (audit log: none) | (audit log: none) |

Partitioned tables (`favorite`, `payment_method`, `review`, `user_image_history`, `wallet`, `event_media`, `story`, `event_share`, `media_audit`) inherit their parent's policies; leaves have none of their own.

## Migrations that define the current RLS state

`20260825105233…_batch1` → `…_batch7`, `20260825110112_enable_rls_wallet`, `20260903202906_consolidate_permissive_policies`, `20260903203408_split_for_all_policies`, `20260903231755_protect_user_info_allow_service_role`, `20260903234655_moderation_filter_public_select_policies`, `20260904130247_phase1_security_and_fk_indexes`, `20260904135932_fix_new_partition_rls_regression`, `20260904170842_low009_deny_policies_service_role_tables`, `20260908215345_place_promotion_rls_replay_fix`, `20260909115349_user_image_history_owner_insert`, `20260910230109_lock_money_path_client_writes`, `20260911005153_lock_promo_subscription_writes_and_partial_refund_release`, `20260911080616_staff_managed_column_guards`, plus the credit, rewards and fieldops migrations for their own tables.
