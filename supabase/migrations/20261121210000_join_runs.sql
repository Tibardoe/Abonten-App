-- Runs of shows: bring another listing, or another run, into this run
-- (docs/architecture/show-runs.md §2b).
--
-- A run is the events that share event.series_id; buyers see it once and
-- pick a show. An organizer who made a separate copy for the second week of
-- a play and then added shows to the copy ended up with two runs of the
-- same play, listed twice (Roverman's Fame In Flames: 27-29 November and
-- 4-6 December). There was no way to put them together. Now an organizer
-- (or a team member who manages events) can bring another of their
-- published listings, with every show of its run, into this run.
--
-- Refused: not both the account's; not both published and current; already
-- the same run; another country or currency (a run keeps one market, as
-- event_add_show does); a pass in either run (a pass is sold for the shows
-- of its own run); two shows at the same time at the same venue (the rule
-- event_add_show keeps: a tour may play two cities at once). Each show
-- stays its own event: nothing about tickets, seats or money changes.

begin;

create or replace function public.event_join_runs(
  p_account        uuid,
  p_event_id       uuid,
  p_other_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.event;
  v_other  public.event;
  v_series uuid;
  v_old    uuid;
  v_ids    uuid[];
  v_moved  integer;
begin
  -- Both listings, locked in a fixed order.
  perform 1 from public.event e
   where e.id in (p_event_id, p_other_event_id)
   order by e.id
     for update;
  select * into v_target from public.event where id = p_event_id;
  select * into v_other from public.event where id = p_other_event_id;
  if v_target.id is null or v_other.id is null
     or v_target.organizer_id <> p_account
     or v_other.organizer_id <> p_account then
    raise exception 'join_runs:not_yours';
  end if;
  if v_target.status <> 'published' or v_other.status <> 'published'
     or v_target.archived_at is not null or v_other.archived_at is not null then
    raise exception 'join_runs:not_published';
  end if;
  if coalesce(v_target.series_id, v_target.id) = coalesce(v_other.series_id, v_other.id) then
    raise exception 'join_runs:same_run';
  end if;
  if v_target.country_code is distinct from v_other.country_code
     or v_target.currency is distinct from v_other.currency then
    raise exception 'join_runs:other_country';
  end if;

  -- The other side: every show of its run, or the one listing.
  select coalesce(array_agg(e.id order by e.id), '{}'::uuid[]) into v_ids
    from public.event e
   where e.id = v_other.id
      or (v_other.series_id is not null and e.series_id = v_other.series_id);
  perform 1 from public.event e where e.id = any (v_ids) order by e.id for update;
  if exists (
    select 1 from public.event e
     where e.id = any (v_ids) and e.organizer_id <> p_account
  ) then
    raise exception 'join_runs:not_yours';
  end if;

  -- A pass is sold for the shows of its own run: runs with passes stay apart.
  if exists (
    select 1
      from public.ticket_type tt
      join public.event e on e.id = tt.event_id
     where tt.pass_shows is not null
       and (e.id = any (v_ids)
            or e.id = v_target.id
            or (v_target.series_id is not null and e.series_id = v_target.series_id))
  ) then
    raise exception 'join_runs:has_passes';
  end if;

  v_series := v_target.series_id;
  if v_series is null then
    insert into public.event_series (organizer_id)
    values (p_account)
    returning id into v_series;
    update public.event set series_id = v_series where id = v_target.id;
  end if;

  -- One show per time at a venue; a tour may play two cities at once.
  if exists (
    select 1
      from public.event o
      join public.event t on t.series_id = v_series and t.starts_at = o.starts_at
     where o.id = any (v_ids)
       and o.status = 'published' and o.archived_at is null
       and t.status = 'published' and t.archived_at is null
       and (t.location is null or o.location is null
            or extensions.st_dwithin(t.location, o.location, 100))
  ) then
    raise exception 'join_runs:same_time';
  end if;

  v_old := v_other.series_id;
  update public.event set series_id = v_series where id = any (v_ids);
  get diagnostics v_moved = row_count;
  if v_old is not null then
    delete from public.event_series s
     where s.id = v_old
       and not exists (select 1 from public.event e where e.series_id = v_old);
  end if;

  return jsonb_build_object('shows', v_moved, 'series_id', v_series);
end;
$$;

comment on function public.event_join_runs(uuid, uuid, uuid) is
  'Brings another of the account''s published listings, with every show of its run, into this listing''s run. Service role only; the service resolves the acting account.';

revoke all on function public.event_join_runs(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.event_join_runs(uuid, uuid, uuid) to service_role;

do $$
begin
  if has_function_privilege('authenticated', 'public.event_join_runs(uuid, uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.event_join_runs(uuid, uuid, uuid)', 'execute') then
    raise exception 'migration check: clients may join runs';
  end if;
end;
$$;

commit;
