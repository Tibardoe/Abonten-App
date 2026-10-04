-- Ended events: one job in the database, in every environment, and an
-- ended event is archived, never deleted. Decisions S8 and D8, taken by the
-- owner on 2026-10-04.
--
-- What it replaces
--
--   Every midnight UTC a pg_cron job created by hand on production
--   (`cleanupExpiredEvents`) called the edge function
--   `delete-expired-events`, which read every unarchived event into memory,
--   decided in JavaScript which had ended and called
--   archive_or_delete_expired_event() for each. That arrangement:
--     * existed on production only: the preview project and a fresh
--       database never retired anything;
--     * could be started by anyone holding the public anon key, by calling
--       the function's URL;
--     * destroyed a deleted event's flyer on Cloudinary directly, without
--       asking whether another listing used the image;
--     * recorded "succeeded" whatever the function answered (the cron only
--       queued an HTTP request, with a one-second timeout);
--     * left the old service-role JWT, deactivated since 2026-09-04, in
--       Vault, and the anon key it sent in a second Vault secret.
--
-- What happens now
--
--   * retire_ended_events() archives, in one statement, every event whose
--     last date is over: an event with dates of its own (event_occurrence)
--     is judged by those, otherwise by its own end; an event with no end is
--     never retired. Archived takes an event out of discovery and keeps it
--     everywhere else: its page, its tickets, its reviews and the
--     organizer's profile.
--   * Nothing is deleted any more (D8). Until now an ended event that
--     nobody registered for, attended, reviewed or paid for was deleted with
--     the favourites and shares that pointed at it, and dropped off the
--     organizer's profile. An organizer's past events are their record of
--     what they hosted, a deletion cannot be undone, and keeping a row costs
--     next to nothing. An organizer can still delete their own event.
--   * The job runs at midnight UTC, as before (`retire-ended-events`),
--     inside the database, so a failure shows as a failed run in
--     Admin › Monitoring (cron_health()).
--   * The hand-made job is unscheduled and both Vault secrets are removed.
--     The edge function is deleted from the project separately (it is not a
--     database object).
--   * archive_or_delete_expired_event() is dropped: the edge function was
--     its only caller.
--
-- Safe to replay: every step checks first, so a database without the old
-- job or the secrets (preview, CI, local) runs it as well.

create or replace function public.retire_ended_events()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_archived integer;
begin
  with ended as (
    select e.id
    from public.event e
    where e.archived_at is null
      and case
            when exists (select 1 from public.event_occurrence o where o.event_id = e.id)
              then not exists (select 1 from public.event_occurrence o
                               where o.event_id = e.id and o.ends_at >= now())
            else e.ends_at is not null and e.ends_at < now()
          end
    -- A row someone is editing right now is retired by the next run.
    for update of e skip locked
  )
  update public.event e
  set archived_at = now()
  from ended
  where e.id = ended.id;
  get diagnostics v_archived = row_count;

  return jsonb_build_object('archived', v_archived, 'at', now());
end;
$function$;

comment on function public.retire_ended_events() is
  'Archives every event whose last date is over (its own dates if it has any, else its own end). '
  'Never deletes. Run daily by the retire-ended-events job; service role only.';

revoke all on function public.retire_ended_events() from public, anon, authenticated;
grant execute on function public.retire_ended_events() to service_role;

drop function if exists public.archive_or_delete_expired_event(uuid);

-- The old job and its secrets (production only; nothing to do elsewhere).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanupExpiredEvents') then
    perform cron.unschedule('cleanupExpiredEvents');
  end if;
end
$$;

delete from vault.secrets
where name in ('cleanup_expired_events_anon_key', 'cleanup_expired_events_service_role_key');

select cron.schedule('retire-ended-events', '0 0 * * *', $$select public.retire_ended_events();$$);

-- Checks
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanupExpiredEvents') then
    raise exception 'migration check: cleanupExpiredEvents is still scheduled';
  end if;
  if not exists (select 1 from cron.job where jobname = 'retire-ended-events' and active) then
    raise exception 'migration check: retire-ended-events is not scheduled';
  end if;
  if exists (select 1 from vault.secrets
             where name in ('cleanup_expired_events_anon_key', 'cleanup_expired_events_service_role_key')) then
    raise exception 'migration check: the old Vault secrets are still there';
  end if;
  if has_function_privilege('anon', 'public.retire_ended_events()', 'execute')
     or has_function_privilege('authenticated', 'public.retire_ended_events()', 'execute') then
    raise exception 'migration check: retire_ended_events must not be callable by the apps';
  end if;
  if to_regprocedure('public.archive_or_delete_expired_event(uuid)') is not null then
    raise exception 'migration check: archive_or_delete_expired_event is still there';
  end if;
end
$$;
