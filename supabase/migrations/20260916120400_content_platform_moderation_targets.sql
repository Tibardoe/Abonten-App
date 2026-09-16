-- Spotlight + Stories: let moderation_action record the new targets.
--
-- apply_moderation_action (replaced in 20260916120000) accepts spotlight,
-- story and content_comment, but the moderation_action row it inserts was
-- still limited by the original target_type check, so every Spotlight /
-- Story / comment moderation failed. The same check never listed message or
-- conversation either (added to the RPC by the messaging work), so staff
-- moderation of reported messages failed the same way; widened here too.

alter table public.moderation_action
  drop constraint if exists moderation_action_target_type_check;

alter table public.moderation_action
  add constraint moderation_action_target_type_check
  check (target_type in (
    'event', 'place', 'event_review', 'place_review', 'user_review',
    'highlight', 'user', 'message', 'conversation',
    'spotlight', 'story', 'content_comment'
  ));
