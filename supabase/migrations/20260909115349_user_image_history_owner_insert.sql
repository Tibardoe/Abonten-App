-- Restore the owner INSERT path on user_image_history.
--
-- 20260825105625_enable_rls_social_batch4.sql turned RLS on for this table
-- and its four partitions but created only:
--
--   CREATE POLICY user_image_history_owner_select ... FOR SELECT
--
-- saveAvatarToSupabase (the web avatar action) writes the history row on the
-- user's OWN cookie session, so from that migration onward every one of those
-- inserts has been refused with "new row violates row-level security policy".
-- Verified on this database by impersonating the owner role.
--
-- Two consequences, both live since 2026-08-25:
--   * The action treats the failed insert as fatal and returns 500
--     "We couldn't update your profile photo. Please try again." — after
--     user_info.avatar_public_id has already been updated. The photo changes,
--     the user is told it failed, and a retry uploads another Cloudinary asset.
--   * No avatar history has been recorded at all. The newest row in this table
--     is dated 2026-08-24, the day before that migration.
--
-- The policy below is the INSERT half of the owner-only pair the table was
-- always meant to have, written the same way as its SELECT policy (and as the
-- favorite/review owner policies in that same batch): a user may only add
-- history rows for themselves. Reading stays owner-only and nothing else
-- changes. Partitions keep RLS on with no policies of their own, so they
-- remain unreachable except through the parent — same as before.

create policy user_image_history_owner_insert on public.user_image_history
  for insert with check ((select auth.uid()) = user_id);
