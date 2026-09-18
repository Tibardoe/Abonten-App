-- Holistic audit 2026-09-18: covering indexes for foreign keys the app
-- actually looks up by, and removal of duplicated CHECK constraints.
--
-- Every index below backs a real access path:
--   * user_id columns on engagement/personal tables -- read by the account
--     anonymiser (anonymize_deleted_account deletes personal rows by user)
--     and the "my reactions/likes/shares" views; without an index each of
--     those is a sequential scan that grows with the whole table.
--   * content_not_interested.post_id -- the feed builder excludes hidden
--     posts by post id; post deletion cascades through this FK.
--   * content_campaign.checkout_id -- payment finalisation and the campaign
--     reconciliation job resolve a campaign from its checkout.
--   * content_post.cover_media_id -- media purge (content_housekeeping)
--     checks whether a media row is still a cover before deleting it.
--   * event_reminder_sent.event_id -- the hourly reminder job anti-joins on
--     event; event deletion cascades through this FK.
--   * verification_case.place_id / organizer_user_id -- typed subject FKs
--     that the owner-change and ban revocation triggers look up by.
--   * credit_reservation journal FKs -- credit reconciliation joins
--     reservations to their reserve/capture/release journals.
--   * story.user_id / wallet.user_id -- partitioned tables; the FK lives on
--     each partition, so the parent index propagates to all of them.
--
-- The remaining unindexed FKs reported by the advisor (`*_by` audit columns:
-- moderated_by, created_by, assigned_by, status_changed_by, updated_by,
-- media_audit.user_id, fieldops_prospect.territory_id,
-- weekly_edition.duplicated_from_edition_id) reference admin ids or are
-- never used as a lookup key; they are left alone on purpose.
--
-- Duplicate CHECK constraints: an earlier migration re-added ticket_type
-- and promo_code range checks under new names next to the ones that already
-- existed. Each pair is logically identical (a NULL passes a CHECK either
-- way), so the second copy only costs evaluation time and reads as if two
-- rules applied. One of each pair is dropped; the surviving constraint keeps
-- the invariant.

create index if not exists idx_content_reaction_user
  on public.content_reaction (user_id);
create index if not exists idx_content_comment_like_user
  on public.content_comment_like (user_id);
create index if not exists idx_content_share_user
  on public.content_share (user_id);
create index if not exists idx_content_not_interested_post
  on public.content_not_interested (post_id);
create index if not exists idx_content_campaign_checkout
  on public.content_campaign (checkout_id);
create index if not exists idx_content_post_cover_media
  on public.content_post (cover_media_id)
  where cover_media_id is not null;
create index if not exists idx_event_reminder_sent_event
  on public.event_reminder_sent (event_id);
create index if not exists idx_verification_case_place
  on public.verification_case (place_id)
  where place_id is not null;
create index if not exists idx_verification_case_organizer_user
  on public.verification_case (organizer_user_id)
  where organizer_user_id is not null;
create index if not exists idx_credit_reservation_reserve_journal
  on public.credit_reservation (reserve_journal_id);
create index if not exists idx_credit_reservation_capture_journal
  on public.credit_reservation (capture_journal_id)
  where capture_journal_id is not null;
create index if not exists idx_credit_reservation_release_journal
  on public.credit_reservation (release_journal_id)
  where release_journal_id is not null;
create index if not exists idx_story_user
  on public.story (user_id);
create index if not exists idx_wallet_user
  on public.wallet (user_id);

alter table public.ticket_type
  drop constraint if exists ticket_type_price_nonneg;
alter table public.ticket_type
  drop constraint if exists ticket_type_quantity_nonneg;
alter table public.promo_code
  drop constraint if exists promo_code_discount_pct_range;
