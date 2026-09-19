-- Holistic audit 2026-09-19: least-privilege grants and the messaging
-- realtime cut-over's last step.
--
-- 1. Trigger functions are never meant to be called over PostgREST. Five of
--    them still carried the default PUBLIC EXECUTE grant (one of them
--    SECURITY DEFINER), which the security advisor lists as callable by
--    `anon`. Calling a trigger function directly errors in Postgres, but the
--    grant is noise in every future review and violates the rule that
--    nothing is executable by a client role unless a client needs it.
--
-- 2. The three `expire_stale_*_checkouts` sweeps: EXECUTE for `authenticated`
--    was revoked here and RESTORED by 20260919120000 — the application runs
--    the sweep on demand with the caller's session as a self-heal before
--    reading a checkout. Kept in this file so the replay history stays
--    honest; see the follow-up migration for the reasoning.
--
-- 3. Messaging realtime moved from `postgres_changes` to trigger-driven
--    broadcasts on private channels on 2026-09-18
--    (20260918120100_messaging_realtime_broadcast_from_database.sql). The
--    four tables stayed in the `supabase_realtime` publication so clients
--    built before that change kept working. That web build is live and no
--    store build of the mobile app exists yet, so no client still
--    subscribes to `postgres_changes` on these tables. Removing them stops
--    the WAL decoder from shipping every message row change to the realtime
--    server, and REPLICA IDENTITY FULL (only needed for `postgres_changes`
--    UPDATE/DELETE payloads) goes back to the default, which stops every
--    update on these tables writing the whole old row into the WAL.

begin;

-- 1. trigger functions
revoke execute on function public.enforce_avatar_public_id_owner() from public, anon, authenticated;
revoke execute on function public.enforce_event_review_eligibility() from public, anon, authenticated;
revoke execute on function public.guard_super_admin_role_permissions() from public, anon, authenticated;
revoke execute on function public.touch_draft() from public, anon, authenticated;
revoke execute on function public.touch_messaging_updated_at() from public, anon, authenticated;

-- 2. cron sweeps
revoke execute on function public.expire_stale_ticket_checkouts() from public, anon, authenticated;
revoke execute on function public.expire_stale_event_promotion_checkouts() from public, anon, authenticated;
revoke execute on function public.expire_stale_place_promotion_checkouts() from public, anon, authenticated;
grant execute on function public.expire_stale_ticket_checkouts() to service_role;
grant execute on function public.expire_stale_event_promotion_checkouts() to service_role;
grant execute on function public.expire_stale_place_promotion_checkouts() to service_role;

-- 3. realtime publication
do $$
declare
  t text;
begin
  foreach t in array array['message', 'conversation', 'conversation_participant', 'message_reaction']
  loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end
$$;

alter table public.message replica identity default;
alter table public.conversation replica identity default;
alter table public.conversation_participant replica identity default;
alter table public.message_reaction replica identity default;

commit;
