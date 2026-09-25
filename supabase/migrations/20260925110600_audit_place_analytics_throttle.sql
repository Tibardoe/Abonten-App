-- Full-system audit 2026-09-25: place_analytics_event takes inserts from
-- anyone (the apps log views and clicks without a session), with no bound
-- and a client-chosen created_at. A script could inflate any place's
-- numbers, backdate them into any report period, or grow the table without
-- limit. Now, for client writes: the timestamp is the server's, and each
-- place keeps at most 60 rows per event type per minute (extra rows are
-- dropped silently — the caller is analytics, not a user action).

-- The count must see every row, not only what the caller's RLS shows
-- (anon can't read the table), so it lives in a definer helper that only
-- the trigger uses.
create or replace function public.place_analytics_recent_count(
  p_place_id uuid,
  p_event_type text
)
returns integer
language sql
stable
security definer
set search_path to ''
as $function$
  select count(*)::integer
  from public.place_analytics_event e
  where e.place_id = p_place_id
    and e.event_type = p_event_type
    and e.created_at > now() - interval '1 minute';
$function$;
revoke execute on function public.place_analytics_recent_count(uuid, text)
  from public, anon, authenticated;

create or replace function public.throttle_place_analytics_event()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- SECURITY DEFINER (to call the helper), so the caller is read from the
  -- request's JWT role, not current_user.
  if coalesce(auth.role(), 'service_role') not in ('authenticated', 'anon') then
    return new;
  end if;
  new.created_at := now();
  if public.place_analytics_recent_count(new.place_id, new.event_type) >= 60 then
    return null;
  end if;
  return new;
end;
$function$;

drop trigger if exists place_analytics_event_throttle on public.place_analytics_event;
create trigger place_analytics_event_throttle
  before insert on public.place_analytics_event
  for each row execute function public.throttle_place_analytics_event();
