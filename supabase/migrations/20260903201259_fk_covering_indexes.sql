-- Perf advisor 0001_unindexed_foreign_keys: covering indexes for foreign
-- keys that back a CASCADE / SET NULL / RESTRICT delete on a
-- user-triggered flow (deleteEvent, deletePlace, remove payout account,
-- delete ticket type, account deletion). Without a covering index each such
-- delete does a sequential scan of the child table per FK.
--
-- Purely additive, no behaviour change. Non-CONCURRENTLY is fine here — the
-- child tables are near-empty at current volume, so the ACCESS EXCLUSIVE
-- lock is momentary. Cold/legacy tables the advisor also flagged (wallet,
-- media_audit, story, subscription*) are deliberately skipped — nothing
-- deletes from or joins them today.

-- event delete cascades
create index if not exists idx_favorite_event_id on public.favorite (event_id);
create index if not exists idx_favorite_place_place_id on public.favorite_place (place_id);
create index if not exists idx_promo_code_usage_event_id on public.promo_code_usage (event_id);
create index if not exists idx_promo_code_usage_user_id on public.promo_code_usage (user_id);
create index if not exists idx_event_share_event_id on public.event_share (event_id);
create index if not exists idx_event_share_user_id on public.event_share (user_id);
create index if not exists idx_receiving_account_event_id on public.receiving_account (event_id);
create index if not exists idx_receiving_account_user_id on public.receiving_account (user_id);

-- place delete / report cascades
create index if not exists idx_place_report_place_id on public.place_report (place_id);
create index if not exists idx_place_report_reporter_id on public.place_report (reporter_id);
create index if not exists idx_place_report_review_id on public.place_report (review_id);
create index if not exists idx_place_booking_service_id on public.place_booking (service_id);
create index if not exists idx_place_claim_request_claimant_id on public.place_claim_request (claimant_id);
create index if not exists idx_place_claim_request_reviewed_by on public.place_claim_request (reviewed_by);

-- promotion tiers / checkouts
create index if not exists idx_event_promotion_tier_id on public.event_promotion (tier_id);
create index if not exists idx_event_promotion_checkout_event_id on public.event_promotion_checkout (event_id);
create index if not exists idx_event_promotion_checkout_tier_id on public.event_promotion_checkout (tier_id);
create index if not exists idx_place_promotion_tier_id on public.place_promotion (tier_id);
create index if not exists idx_place_promotion_checkout_place_id on public.place_promotion_checkout (place_id);
create index if not exists idx_place_promotion_checkout_tier_id on public.place_promotion_checkout (tier_id);

-- payment_attempt (money path) — all five payment_method FKs are
-- (payment_method_id, user_id) -> payment_method{,_p0..p3}; one composite covers them.
create index if not exists idx_payment_attempt_payment_method
  on public.payment_attempt (payment_method_id, user_id);
create index if not exists idx_payment_attempt_transaction_id
  on public.payment_attempt (transaction_id);
create index if not exists idx_payment_attempt_event_promo_checkout_id
  on public.payment_attempt (event_promotion_checkout_id);
create index if not exists idx_payment_attempt_place_promo_checkout_id
  on public.payment_attempt (place_promotion_checkout_id);

-- payout account removal / ticket-type delete
create index if not exists idx_payout_payout_account_id on public.payout (payout_account_id);
create index if not exists idx_ticket_checkout_ticket_type_id on public.ticket_checkout (ticket_type_id);
