-- Tours: one run of shows across several venues (2026-11-20,
-- docs/architecture/show-runs.md "Tours"; the founder asked for it with the
-- move-an-event work).
--
-- A run (event_series) was one listing repeated at its own venue. A show can
-- now be somewhere else in the same country:
--
--   event_add_show()      takes an optional venue: an Abonten place
--                         (p_place_id) or an address with its point
--                         (p_latitude, p_longitude, p_address, p_country_code,
--                         p_timezone, both resolved by the service). The
--                         country must be the listing's (its currency and
--                         market). A show at another venue does not take the
--                         seat map: a seat map belongs to a hall. Two shows of
--                         a run may start at the same time when they are at
--                         different venues (more than 100 m apart).
--   get_event_shows()     also returns each show's venue (place, name,
--                         address, city), so the show pickers group a tour by
--                         venue.
--   Explore, search and suggestions list a run once, as before; with the
--   reader's position they now pick the show at the venue nearest the reader
--   (to the kilometre), then the earliest there, instead of the earliest
--   anywhere.
--
-- event_add_show and get_event_shows change shape, so they are dropped and
-- made again (checked against the definitions this was written against);
-- the three discovery functions get a one-line change to their run ordering,
-- each checked against its fingerprint and its anchor.

begin;

-- ---------------------------------------------------------------------------
-- Fingerprints (line endings ignored): the functions changed below must be
-- the ones this migration was written against.
do $fp$
declare
  r record;
begin
  for r in
    select * from (values
      ('event_add_show',            '377fce3805984d76c61694aff5859d6b'),
      ('get_event_shows',           'f5b60879ddc26efcd2c1dd4a8611797d'),
      ('_explore_event_candidates', '9ef0810246b9e7d15f8f7d753b374b66'),
      ('search_events',             'fb07c232e9fb2497edcc9516d791968a'),
      ('search_suggest',            '2201561c02ed01e6c7de7999a3115cfc')
    ) as f(name, fingerprint)
  loop
    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = r.name
        and md5(replace(p.prosrc, E'\r', '')) = r.fingerprint
    ) then
      raise exception 'tours: public.% is not the definition this migration expects', r.name;
    end if;
  end loop;
end;
$fp$;

-- ---------------------------------------------------------------------------
-- event_add_show: a show (or a copy) at the listing's venue or another one.

drop function public.event_add_show(uuid, timestamptz, timestamptz, text, text, uuid, boolean);

create function public.event_add_show(
  p_source            uuid,
  p_starts_at         timestamptz,
  p_ends_at           timestamptz,
  p_event_code        text,
  p_slug              text,
  p_client_request_id uuid,
  p_in_series         boolean default true,
  p_place_id          uuid default null,
  p_latitude          double precision default null,
  p_longitude         double precision default null,
  p_address           jsonb default null,
  p_country_code      text default null,
  p_timezone          text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_src      public.event%rowtype;
  v_place    public.place%rowtype;
  v_series   uuid;
  v_new      uuid;
  v_shift    interval;
  v_location extensions.geography;
  v_address  jsonb;
  v_place_id uuid;
  v_timezone text;
  v_moved    boolean := false;
begin
  if p_client_request_id is null then
    raise exception 'event_add_show: a client request id is required';
  end if;

  select id into v_new from public.event where client_request_id = p_client_request_id;
  if v_new is not null then
    return v_new;
  end if;

  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'A show needs a start and an end after it.'
      using errcode = 'check_violation';
  end if;
  if p_starts_at <= now() then
    raise exception 'A new show must start in the future.'
      using errcode = 'check_violation';
  end if;

  select * into v_src from public.event where id = p_source for update;
  if not found then
    raise exception 'event_add_show: no such listing' using errcode = 'no_data_found';
  end if;
  if v_src.status is distinct from 'published' then
    raise exception 'Only a published listing can be copied.'
      using errcode = 'check_violation';
  end if;
  -- A listing Abonten has hidden or removed takes no new shows or copies.
  if v_src.moderation_state in ('hidden', 'removed') then
    raise exception 'Abonten has hidden this listing, so it can''t be copied.'
      using errcode = 'check_violation';
  end if;

  -- Where the show is: the listing's venue, an Abonten place, or an address
  -- the service resolved (country and time zone from the point).
  v_location := v_src.location;
  v_address  := v_src.address;
  v_place_id := v_src.place_id;
  v_timezone := v_src.timezone;
  if p_place_id is not null then
    select * into v_place from public.place pl where pl.id = p_place_id;
    if not found
       or v_place.status is distinct from 'published'
       or v_place.moderation_state in ('hidden', 'removed')
       or v_place.location is null then
      raise exception 'That place can''t host a show on Abonten.'
        using errcode = 'check_violation';
    end if;
    if v_place.country_code is distinct from v_src.country_code then
      raise exception 'A show must be in the same country as the listing.'
        using errcode = 'check_violation';
    end if;
    v_location := v_place.location;
    v_address  := coalesce(p_address, v_place.address);
    v_place_id := v_place.id;
    v_timezone := coalesce(nullif(btrim(v_place.timezone), ''), v_src.timezone);
  elsif p_latitude is not null or p_longitude is not null then
    if p_latitude is null or p_longitude is null
       or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
       or p_address is null or coalesce(btrim(p_address ->> 'full_address'), '') = '' then
      raise exception 'event_add_show: a venue needs a point and an address';
    end if;
    if upper(btrim(coalesce(p_country_code, ''))) is distinct from v_src.country_code::text then
      raise exception 'A show must be in the same country as the listing.'
        using errcode = 'check_violation';
    end if;
    v_location := extensions.st_setsrid(
      extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography;
    v_address  := p_address;
    v_place_id := null;
    v_timezone := coalesce(nullif(btrim(p_timezone), ''), v_src.timezone);
  end if;
  -- More than 100 m away is another venue (a hall's seat map stays behind).
  v_moved := (p_place_id is not null or p_latitude is not null)
             and (v_src.location is null
                  or not extensions.st_dwithin(v_location, v_src.location, 100));

  -- Sale windows and promo code expiries move with the date.
  v_shift := p_starts_at - coalesce(
    (select min(o.starts_at) from public.event_occurrence o where o.event_id = v_src.id),
    v_src.starts_at,
    p_starts_at);

  if p_in_series then
    v_series := v_src.series_id;
    if v_series is null then
      insert into public.event_series (organizer_id)
      values (v_src.organizer_id)
      returning id into v_series;
      update public.event set series_id = v_series where id = v_src.id;
    end if;
    -- One show per time at a venue; a tour may play two cities at once.
    if exists (
      select 1 from public.event e
      where e.series_id = v_series and e.starts_at = p_starts_at
        and e.status = 'published' and e.archived_at is null
        and (e.location is null or v_location is null
             or extensions.st_dwithin(e.location, v_location, 100))
    ) then
      raise exception 'This run already has a show at that time.'
        using errcode = 'unique_violation';
    end if;
  end if;

  insert into public.event (
    client_request_id, organizer_id, title, slug, description, event_code,
    event_category, event_type, location, address, capacity, website_url,
    flyer_public_id, flyer_version, starts_at, ends_at, status,
    require_registration, featured, place_id, created_at,
    country_code, timezone, currency, refund_policy, refund_cutoff_hours,
    series_id
  ) values (
    p_client_request_id, v_src.organizer_id, v_src.title, p_slug, v_src.description, p_event_code,
    v_src.event_category, v_src.event_type, v_location, v_address, v_src.capacity, v_src.website_url,
    v_src.flyer_public_id, v_src.flyer_version, p_starts_at, p_ends_at, 'published',
    v_src.require_registration, false, v_place_id, now(),
    v_src.country_code, v_timezone, v_src.currency, v_src.refund_policy, v_src.refund_cutoff_hours,
    v_series
  )
  returning id into v_new;

  -- Ticket types with their full stock: what is left plus what was sold or
  -- is being bought (a cancelled ticket was put back already).
  insert into public.ticket_type (
    event_id, type, price, currency, quantity, admits, available_from, available_until, pass_shows,
    seating_section_id
  )
  select
    v_new, tt.type, tt.price, tt.currency,
    case when tt.quantity is null then null
         else tt.quantity
              + (select count(*) from public.ticket t
                 where t.ticket_type_id = tt.id and t.status in ('active', 'used'))::integer
              + coalesce((select sum(tc.quantity) from public.ticket_checkout tc
                          where tc.ticket_type_id = tt.id
                            and tc.status in ('pending', 'on_plan')), 0)::integer
    end,
    tt.admits,
    tt.available_from + v_shift,
    tt.available_until + v_shift,
    tt.pass_shows,
    case when v_moved then null else tt.seating_section_id end
  from public.ticket_type tt
  where tt.event_id = v_src.id
  order by tt.created_at;

  -- The seating plan comes too at the same venue; each ticket type kept its
  -- section above.
  insert into public.event_seating (event_id, plan_id)
  select v_new, s.plan_id
  from public.event_seating s
  where s.event_id = v_src.id
    and not v_moved;

  insert into public.event_group_discount (event_id, min_tickets, percent_off)
  select v_new, g.min_tickets, g.percent_off
  from public.event_group_discount g
  where g.event_id = v_src.id;

  insert into public.promo_code (event_id, promo_code, discount_percentage, expires_at, max_uses, is_active)
  select v_new, p.promo_code, p.discount_percentage, p.expires_at + v_shift, p.max_uses, true
  from public.promo_code p
  where p.event_id = v_src.id
    and p.is_active
    and (p.expires_at is null or p.expires_at + v_shift > now());

  insert into public.event_promoter_commission (event_id, rate_bps, is_active, updated_by, invited_only)
  select v_new, c.rate_bps, c.is_active, c.updated_by, c.invited_only
  from public.event_promoter_commission c
  where c.event_id = v_src.id;

  insert into public.event_promoter (event_id, promoter_id, rate_bps, added_by)
  select v_new, p.promoter_id, p.rate_bps, p.added_by
  from public.event_promoter p
  where p.event_id = v_src.id and p.removed_at is null;

  insert into public.event_ticket_plan_setting (event_id, enabled, updated_by)
  select v_new, s.enabled, s.updated_by
  from public.event_ticket_plan_setting s
  where s.event_id = v_src.id;

  insert into public.event_ticket_transfer_setting (event_id, enabled, updated_by)
  select v_new, s.enabled, s.updated_by
  from public.event_ticket_transfer_setting s
  where s.event_id = v_src.id;

  return v_new;
end;
$function$;

comment on function public.event_add_show(uuid, timestamptz, timestamptz, text, text, uuid, boolean, uuid, double precision, double precision, jsonb, text, text) is
  'A new show of a run (or a separate copy) made from a published listing, at its venue or another venue in the same country (an Abonten place, or a point and address resolved by the service). Service role only (docs/architecture/show-runs.md).';

-- ---------------------------------------------------------------------------
-- get_event_shows: each show's venue too.

drop function public.get_event_shows(uuid);

create function public.get_event_shows(p_event_id uuid)
returns table (
  id            uuid,
  event_code    text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  timezone      text,
  status        text,
  seats_left    integer,
  sold_out      boolean,
  place_id      uuid,
  venue_name    text,
  venue_address text,
  city          text
)
language sql
stable
security definer
set search_path to ''
as $function$
  with me as (
    select e.series_id from public.event e where e.id = p_event_id
  ),
  shows as (
    select e.*
    from public.event e, me
    where me.series_id is not null
      and e.series_id = me.series_id
      and e.status in ('published', 'canceled')
      and e.archived_at is null
      and e.moderation_state is distinct from 'hidden'
      and e.moderation_state is distinct from 'removed'
      and e.country_code <> all ((select public.hidden_listing_countries())::text[])
      and coalesce(e.ends_at, e.starts_at) > now()
  ),
  counts as (
    select s.id,
           s.capacity
             - coalesce((select sum(a.number_of_tickets) from public.attendance a
                         where a.event_id = s.id and a.status = 'attending'), 0)
             - coalesce((select sum(c.quantity) from public.ticket_checkout c
                         where c.event_id = s.id and c.status in ('pending', 'on_plan')), 0)
             as capacity_left,
           -- Stock limits only bind when every type has one.
           case when bool_and(tt.quantity is not null) then sum(greatest(tt.quantity, 0)) end as stock_left,
           bool_and(tt.quantity is not null and tt.quantity < tt.admits) as types_out,
           count(tt.id) as type_count
    from shows s
    left join public.ticket_type tt on tt.event_id = s.id
    group by s.id, s.capacity
  )
  select s.id, s.event_code, s.starts_at, s.ends_at, s.timezone::text, s.status::text,
         case
           when c.capacity_left is null then c.stock_left::integer
           when c.stock_left is null then greatest(c.capacity_left, 0)::integer
           else least(greatest(c.capacity_left, 0), c.stock_left)::integer
         end,
         s.status = 'canceled'
           or (c.capacity_left is not null and c.capacity_left <= 0)
           or (c.type_count > 0 and c.types_out),
         -- The venue: a place's name only while the place is listed.
         case when pl.id is not null then s.place_id end,
         pl.name,
         nullif(btrim(s.address ->> 'full_address'), ''),
         nullif(btrim(s.address ->> 'city'), '')
  from shows s
  join counts c on c.id = s.id
  left join public.place pl
    on pl.id = s.place_id
   and pl.status = 'published'
   and pl.moderation_state is distinct from 'hidden'
   and pl.moderation_state is distinct from 'removed'
  order by s.starts_at, s.id;
$function$;

comment on function public.get_event_shows(uuid) is
  'The upcoming shows of the run an event belongs to, with seats left and each show''s venue (empty when it is not in a run). Public read (docs/architecture/show-runs.md).';

-- ---------------------------------------------------------------------------
-- A run is listed once; with the reader's position, at its nearest venue.

do $runs$
declare
  v_fn  regprocedure;
  v_def text;
  v_new text;
begin
  -- Explore (every event list).
  select p.oid::regprocedure into strict v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = '_explore_event_candidates';
  v_def := pg_get_functiondef(v_fn);
  v_new := replace(v_def,
$a$    -- A run (event_series) is listed once: its earliest show that matches.
    row_number() over (
      partition by coalesce(e.series_id, e.id)
      order by case when occ.total > 0 then occ.next_start else e.starts_at end, e.id
    ) as c_rank$a$,
$b$    -- A run (event_series) is listed once: its earliest show that matches,
    -- at the venue nearest the reader (to the kilometre) when the list has a
    -- point, so a tour shows each reader the show in their own city.
    row_number() over (
      partition by coalesce(e.series_id, e.id)
      order by case when v_point is not null and e.series_id is not null
                    then round(st_distance(e.location, v_point) / 1000) end,
               case when occ.total > 0 then occ.next_start else e.starts_at end, e.id
    ) as c_rank$b$);
  if v_new = v_def then
    raise exception 'tours: the run ordering of _explore_event_candidates was not found';
  end if;
  execute v_new;

  -- Search results.
  select p.oid::regprocedure into strict v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'search_events';
  v_def := pg_get_functiondef(v_fn);
  v_new := replace(v_def,
$a$    -- A run (event_series) is listed once: its earliest show found.
    select sc.*,
           row_number() over (partition by coalesce(sc.series_id, sc.id)
                              order by sc.starts_at nulls last, sc.id) as series_rank$a$,
$b$    -- A run (event_series) is listed once: its earliest show found, at the
    -- venue nearest the reader (to the kilometre) when the search has a point.
    select sc.*,
           row_number() over (partition by coalesce(sc.series_id, sc.id)
                              order by case when sc.series_id is not null
                                            then round(sc.distance_km) end nulls last,
                                       sc.starts_at nulls last, sc.id) as series_rank$b$);
  if v_new = v_def then
    raise exception 'tours: the run ordering of search_events was not found';
  end if;
  execute v_new;

  -- Suggestions while typing.
  select p.oid::regprocedure into strict v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'search_suggest';
  v_def := pg_get_functiondef(v_fn);
  v_new := replace(v_def,
$a$             -- A run (event_series) is suggested once: its earliest show.
             row_number() over (partition by coalesce(e.series_id, e.id)
                                order by e.starts_at asc nulls last, e.id) as series_rank$a$,
$b$             -- A run (event_series) is suggested once: its earliest show,
             -- at the venue nearest the reader (to the kilometre).
             row_number() over (partition by coalesce(e.series_id, e.id)
                                order by case when v_origin is not null and e.series_id is not null
                                              then round(extensions.st_distance(e.location, v_origin) / 1000) end nulls last,
                                         e.starts_at asc nulls last, e.id) as series_rank$b$);
  if v_new = v_def then
    raise exception 'tours: the run ordering of search_suggest was not found';
  end if;
  execute v_new;
end;
$runs$;

-- ---------------------------------------------------------------------------
-- Grants

revoke all on function public.event_add_show(uuid, timestamptz, timestamptz, text, text, uuid, boolean, uuid, double precision, double precision, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.event_add_show(uuid, timestamptz, timestamptz, text, text, uuid, boolean, uuid, double precision, double precision, jsonb, text, text)
  to service_role;

revoke all on function public.get_event_shows(uuid) from public;
grant execute on function public.get_event_shows(uuid) to anon, authenticated, service_role;

do $check$
begin
  if has_function_privilege('authenticated', 'public.event_add_show(uuid, timestamptz, timestamptz, text, text, uuid, boolean, uuid, double precision, double precision, jsonb, text, text)', 'execute')
     or has_function_privilege('anon', 'public.event_add_show(uuid, timestamptz, timestamptz, text, text, uuid, boolean, uuid, double precision, double precision, jsonb, text, text)', 'execute') then
    raise exception 'migration check: event_add_show is service role only';
  end if;
  if not has_function_privilege('anon', 'public.get_event_shows(uuid)', 'execute') then
    raise exception 'migration check: get_event_shows is a public read';
  end if;
  -- The discovery functions kept their grants through the rewrite.
  if not has_function_privilege('anon', 'public.search_events(text, double precision, double precision, double precision, text, text[], numeric, numeric, timestamptz, timestamptz, numeric, uuid, timestamptz, numeric, uuid, integer)', 'execute')
     or not has_function_privilege('anon', 'public.search_suggest(text, double precision, double precision, text[])', 'execute') then
    raise exception 'migration check: search stays a public read';
  end if;
end;
$check$;

commit;
