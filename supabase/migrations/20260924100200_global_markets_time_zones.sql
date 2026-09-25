-- Global platform, part 3: no database function assumes Africa/Accra.
--
-- Each job or query that needs "local time" now asks the row it works on:
-- an event's reminder uses the event's zone, a place visit the place's, a
-- person's quiet hours and digest their home market's, weekly editions
-- their scope's market, and free-text dates in search the market whose
-- region is nearest the search origin. Where no better source exists the
-- DEFAULT MARKET's zone applies — configuration, not a literal.

create or replace function public.default_market_timezone()
  returns text
  language sql
  stable
  set search_path = ''
as $$
  select m.default_timezone from public.market m where m.is_default limit 1;
$$;
revoke all on function public.default_market_timezone() from public, anon;
grant execute on function public.default_market_timezone() to authenticated, service_role;

-- A person's zone: their home market's default. (Devices format instants
-- themselves; this is for server-side scheduling and copy.)
create or replace function public._user_timezone(p_user_id uuid)
  returns text
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(
    public.market_timezone_for_country((select u.country_code from public.user_info u where u.id = p_user_id)),
    public.default_market_timezone()
  );
$$;
revoke all on function public._user_timezone(uuid) from public, anon, authenticated;

-- Regions may sit in a different zone from their market's default (the US,
-- Canada, Australia…). The zone at a point is the nearest active region's,
-- else its market's default, else the default market's.
alter table public.market_region add column timezone text;
comment on column public.market_region.timezone is 'IANA zone when it differs from the market default (multi-zone countries).';

create or replace function public.market_timezone_at(p_origin extensions.geography)
  returns text
  language sql
  stable
  set search_path = ''
as $$
  select coalesce(
    (
      select coalesce(r.timezone, m.default_timezone)
      from public.market_region r
      join public.market m on m.country_code = r.country_code
      where p_origin is not null
        and r.status = 'active'
        and extensions.st_dwithin(
              p_origin,
              extensions.st_setsrid(extensions.st_makepoint(r.centre_lng, r.centre_lat), 4326)::extensions.geography,
              500000)
      order by extensions.st_distance(
              p_origin,
              extensions.st_setsrid(extensions.st_makepoint(r.centre_lng, r.centre_lat), 4326)::extensions.geography)
      limit 1
    ),
    public.default_market_timezone()
  );
$$;
revoke all on function public.market_timezone_at(extensions.geography) from public, anon;
grant execute on function public.market_timezone_at(extensions.geography) to authenticated, service_role;

-- Search: "tonight" / "this weekend" in the zone of the place being searched.
drop function if exists public._search_temporal(text, timestamp with time zone);
create or replace function public._search_temporal(p_norm text, p_as_of timestamp with time zone, p_timezone text default null)
  returns table(rest text, date_from timestamp with time zone, date_to timestamp with time zone)
  language plpgsql
  stable parallel safe
  set search_path = ''
as $function$
declare
  v_tz     text := coalesce(nullif(p_timezone, ''), public.default_market_timezone(), 'UTC');
  v_tokens text[] := regexp_split_to_array(btrim(coalesce(p_norm, '')), '\s+');
  v_now    timestamp := coalesce(p_as_of, now()) at time zone v_tz;
  v_today  date := v_now::date;
  v_keep   text[] := '{}';
  v_found  boolean := false;
  v_from   timestamp;
  v_to     timestamp;
  v_month  integer;
  v_year   integer;
  v_dow    integer;
  t        text;
begin
  if coalesce(btrim(p_norm), '') = '' then
    return query select coalesce(p_norm, ''), null::timestamptz, null::timestamptz;
    return;
  end if;

  foreach t in array v_tokens loop
    v_month := case t
      when 'january' then 1 when 'jan' then 1
      when 'february' then 2 when 'feb' then 2
      when 'march' then 3
      when 'april' then 4 when 'apr' then 4
      when 'june' then 6 when 'jun' then 6
      when 'july' then 7 when 'jul' then 7
      when 'august' then 8 when 'aug' then 8
      when 'september' then 9 when 'sept' then 9 when 'sep' then 9
      when 'october' then 10 when 'oct' then 10
      when 'november' then 11 when 'nov' then 11
      when 'december' then 12 when 'dec' then 12
      else null
    end;

    if not v_found and v_month is not null then
      v_year := extract(year from v_today)::integer;
      if v_month < extract(month from v_today)::integer then
        v_year := v_year + 1;
      end if;
      v_from := make_timestamp(v_year, v_month, 1, 0, 0, 0);
      v_to := v_from + interval '1 month';
      v_found := true;
    elsif not v_found and t in ('today', 'tonight') then
      v_from := v_now;
      v_to := (v_today + 1)::timestamp;
      v_found := true;
    elsif not v_found and t = 'tomorrow' then
      v_from := (v_today + 1)::timestamp;
      v_to := (v_today + 2)::timestamp;
      v_found := true;
    elsif not v_found and t in ('weekend', 'weekends') then
      v_dow := extract(isodow from v_today)::integer;
      v_from := (v_today + (5 - v_dow))::timestamp + interval '17 hours';
      if v_dow = 1 then
        v_from := (v_today + 4)::timestamp + interval '17 hours';
      end if;
      v_from := greatest(v_from, v_now);
      v_to := (v_today + (8 - v_dow))::timestamp;
      v_found := true;
    else
      v_keep := v_keep || t;
    end if;
  end loop;

  if not v_found then
    return query select p_norm, null::timestamptz, null::timestamptz;
    return;
  end if;

  select coalesce(string_agg(k, ' ' order by ord), '')
    into t
  from unnest(v_keep) with ordinality as u(k, ord)
  where k not in ('this', 'next', 'in', 'on', 'for', 'during');

  return query select
    t,
    (v_from at time zone v_tz),
    (v_to at time zone v_tz);
end;
$function$;
revoke all on function public._search_temporal(text, timestamp with time zone, text) from public, anon, authenticated;

-- Reminders say the event's own local time.
create or replace function public.event_reminders_enqueue()
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_sent integer := 0;
begin
  with sessions as (
    select
      t.user_id,
      e.id as event_id,
      e.title,
      e.timezone,
      e.address ->> 'full_address' as full_address,
      coalesce(o.starts_at, e.starts_at) as starts_at,
      min(t.id::text)::uuid as ticket_id
    from public.ticket t
    join public.ticket_type tt on tt.id = t.ticket_type_id
    join public.event e on e.id = tt.event_id
    join public.user_info ui on ui.id = t.user_id
    left join public.event_occurrence o on o.id = t.occurrence_id
    where t.status = 'active'
      and ui.status_id = 1
      and e.status = 'published'
      and e.archived_at is null
      and coalesce(e.moderation_state, 'visible') not in ('hidden', 'removed')
      and coalesce(o.starts_at, e.starts_at) >= now() + interval '23 hours'
      and coalesce(o.starts_at, e.starts_at) <  now() + interval '25 hours'
      and not exists (
        select 1 from public.event_reminder r
        where r.user_id = t.user_id and r.event_id = e.id)
    group by t.user_id, e.id, e.title, e.timezone, e.address, o.starts_at, e.starts_at
  ), fresh as (
    insert into public.event_reminder_sent (user_id, event_id, session_starts_at, kind)
    select s.user_id, s.event_id, s.starts_at, 'day_before'
    from sessions s
    on conflict do nothing
    returning user_id, event_id, session_starts_at
  )
  insert into public.notification (user_id, type, title, body, link, data)
  select
    s.user_id,
    'event_reminder',
    'Tomorrow: ' || s.title,
    'Starts ' || to_char(s.starts_at at time zone s.timezone, 'FMDay HH24:MI')
      || case when coalesce(s.full_address, '') <> '' then ' at ' || s.full_address else '' end
      || '. Your ticket is in My Events.',
    '/manage/my-events',
    jsonb_build_object('kind', 'ticket', 'eventId', s.event_id, 'ticketId', s.ticket_id)
  from fresh f
  join sessions s
    on s.user_id = f.user_id
   and s.event_id = f.event_id
   and s.starts_at = f.session_starts_at;
  get diagnostics v_sent = row_count;
  return v_sent;
end;
$$;

-- Mechanical rewrites of the remaining functions, each checked afterwards.
do $$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in (
        '_notification_delivery_due', '_search_event_pool', 'place_visit_record', 'place_visit_stats',
        'recommendations_build_digest', 'weekly_edition_document', 'weekly_edition_validation',
        'weekly_edition_view', 'weekly_health', 'weekly_housekeeping'
      )
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := v_def;

    if r.proname = '_notification_delivery_due' then
      v_new := replace(v_new, 'now() at time zone ''Africa/Accra''', 'now() at time zone public._user_timezone(d.user_id)');

    elsif r.proname = '_search_event_pool' then
      v_new := replace(v_new, 'public._search_temporal(p_norm, p_as_of)', 'public._search_temporal(p_norm, p_as_of, public.market_timezone_at(p_origin))');

    elsif r.proname = 'place_visit_record' then
      v_new := replace(v_new, 'p.moderation_state, p.location', 'p.moderation_state, p.location, p.timezone');
      v_new := replace(v_new, 'now() at time zone ''Africa/Accra''', 'now() at time zone v_place.timezone');

    elsif r.proname = 'place_visit_stats' then
      v_new := replace(v_new, 'now() at time zone ''Africa/Accra''', 'now() at time zone (select p.timezone from public.place p where p.id = p_place_id)');

    elsif r.proname = 'recommendations_build_digest' then
      -- The run gate ("is it digest hour yet?") uses the default market's
      -- clock; each person's digest copy uses their own market's zone.
      v_new := replace(v_new, 'now() at time zone ''Africa/Accra''', 'now() at time zone public.default_market_timezone()');
      v_new := replace(v_new, 'v_top.next_start at time zone ''Africa/Accra''', 'v_top.next_start at time zone public._user_timezone(grp.user_id)');

    elsif r.proname in ('weekly_edition_document', 'weekly_edition_validation') then
      v_new := replace(
        v_new,
        '(v_ed.week_start + 7)::timestamp at time zone ''Africa/Accra''',
        '(v_ed.week_start + 7)::timestamp at time zone (select public.market_timezone_for_country(s.country_code) from public.weekly_edition ed join public.weekly_scope s on s.id = ed.scope_id where ed.id = p_edition_id)'
      );

    elsif r.proname = 'weekly_edition_view' then
      v_new := replace(v_new, 'p_as_of at time zone ''Africa/Accra''', 'p_as_of at time zone public.default_market_timezone()');
      v_new := replace(v_new, 'country_code = ''GH''', 'country_code = public.default_market_country()');
      v_new := replace(v_new, 'coalesce(v_scope.country_code, ''GH'')', 'coalesce(v_scope.country_code, public.default_market_country())');

    elsif r.proname in ('weekly_health', 'weekly_housekeeping') then
      v_new := replace(v_new, 'now() at time zone ''Africa/Accra''', 'now() at time zone public.default_market_timezone()');
    end if;

    if v_new = v_def then
      raise exception 'Function % was not rewritten (pattern not found)', r.proname;
    end if;
    if position('Africa/Accra' in v_new) > 0 or position('''GH''' in v_new) > 0 then
      raise exception 'Function % still assumes Ghana after rewrite', r.proname;
    end if;
    execute v_new;
  end loop;
end
$$;

-- Weekly scopes and field regions default to the default market, not a literal.
alter table public.weekly_scope alter column country_code set default public.default_market_country();
alter table public.fieldops_region alter column country_code set default public.default_market_country();

do $$
declare
  v_names text;
begin
  select string_agg(p.proname, ', ') into v_names
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and (pg_get_functiondef(p.oid) like '%Africa/Accra%' or pg_get_functiondef(p.oid) like '%''GH''%');
  if v_names is not null then
    raise exception 'Functions still assume Ghana: %', v_names;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Phone sign-in: the pending code remembers which provider sent it, so the
-- check goes back to the same one (Hubtel in Ghana, Twilio Verify elsewhere).
-- ---------------------------------------------------------------------------
alter table public.phone_otp_state
  add column provider text not null default 'hubtel'
    check (provider in ('hubtel', 'twilio'));
alter table public.phone_otp_state alter column provider drop default;
