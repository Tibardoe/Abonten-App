-- Phase 1 of the system-wide limitation audit (docs/audit/).
-- Three additive, low-risk hardening changes:
--
--   1. SEC-001  Revoke public EXECUTE on get_transaction_refundable_amount.
--              It is SECURITY DEFINER with NO authorization check and is only
--              ever called from service-role code (issueRefundCore,
--              financeAdminCore) — verified. Any signed-in user can currently
--              read the refundable amount for an arbitrary transaction id.
--
--   2. SEC-002  Pin search_path on enforce_avatar_public_id_owner (advisor
--              0011). Its body uses only NEW/OLD records, so SET search_path = ''
--              is safe without rewriting it.
--
--   3. DB-PERF-001  Covering indexes for foreign keys the performance advisor
--              flags as unindexed. The moderation FKs (moderated_by) are almost
--              entirely NULL, so those are partial indexes.

-- 1. SEC-001 ----------------------------------------------------------------
revoke execute on function public.get_transaction_refundable_amount(uuid)
  from anon, authenticated;

-- 2. SEC-002 ----------------------------------------------------------------
alter function public.enforce_avatar_public_id_owner() set search_path = '';

-- 3. DB-PERF-001: moderation FK covering indexes (partial — mostly NULL) ---
create index if not exists idx_event_moderated_by
  on public.event (moderated_by) where moderated_by is not null;

create index if not exists idx_event_review_moderated_by
  on public.event_review (moderated_by) where moderated_by is not null;

create index if not exists idx_place_moderated_by
  on public.place (moderated_by) where moderated_by is not null;

create index if not exists idx_place_review_moderated_by
  on public.place_review (moderated_by) where moderated_by is not null;

create index if not exists idx_highlight_moderated_by
  on public.highlight (moderated_by) where moderated_by is not null;

-- review is range-partitioned; this cascades to every partition.
create index if not exists idx_review_moderated_by
  on public.review (moderated_by) where moderated_by is not null;

-- 3. DB-PERF-001: long-standing unindexed FKs on live tables -------------
-- (wallet / story / media_audit are also flagged but are unused,
-- zero-partition tables — handled under DATA-003, not indexed here.)
create index if not exists idx_subscription_plan_id
  on public.subscription (plan_id);

create index if not exists idx_subscription_transaction_id
  on public.subscription (transaction_id);

create index if not exists idx_subscription_checkout_plan_name
  on public.subscription_checkout (subscription_plan_name);

create index if not exists idx_user_info_status_id
  on public.user_info (status_id);
