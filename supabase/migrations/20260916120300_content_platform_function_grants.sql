-- Spotlight + Stories content platform — follow-up: trigger and helper
-- functions must not be directly callable by clients.
--
-- The security advisor flagged the SECURITY DEFINER trigger functions of
-- part 1 as executable by anon / authenticated (the default EXECUTE grant
-- to PUBLIC). They only ever run as triggers, so the grant is withdrawn the
-- same way guard_restricted_account's was. follow_counts stays callable:
-- public follower counts are the point of it.

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public._content_counter_touch()',
    'public._content_comment_visibility_touch()',
    'public._content_comment_reply_touch()',
    'public._content_comment_like_touch()',
    'public._content_touch_updated_at()',
    'public._content_campaign_ledger_guard()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end;
$$;
