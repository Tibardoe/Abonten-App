-- Explore lists: one rule for what is on, the page picked first, and
-- filters that mean the same thing everywhere.
--
-- What was wrong
--
-- 1. "Nearby events" came in no order. get_nearby_events sorted by the next
--    date of an event that has several dates and gave every other event
--    the same position ("infinity"), so events with one date, which is
--    nearly all of them, came after those and in id order. The website
--    builds its Explore rows (Featured, Happening today, this week, this
--    month, top-rated organizers) from the first 20 of that list and the
--    app from the first 60. In an area with more events than that, the
--    rows were made from an arbitrary 20 or 60: "Happening today" could be
--    empty on a day with events, and a paid promotion only reached the
--    Featured banner when its event happened to be among them.
--
-- 2. The filters on "All events" did not do what the filter sheet says:
--      * a price filter needed both ends. "Free" (up to 0), "Under 50" and
--        "From 20" send one end, so they filtered nothing;
--      * a date filter needed both ends too, and compared instants: the app
--        sends days ("2026-10-10"), which arrive as midnight, so "Today"
--        and "Tomorrow" (the same day twice) matched only an event starting
--        at midnight exactly, and a range stopped at the start of its last
--        day;
--      * an event with several dates was matched on its next date only: a
--        festival on the 5th, 12th and 19th was not found by "10th to 15th";
--      * an event with no ticket tier was dropped by any price filter,
--        though it is shown as free;
--      * "Talent Shows" also brought in "Kids Talent Shows" (types were
--        matched as text inside text);
--      * a point with no radius found nothing.
--    The rows above the list were filtered in the browser with different
--    rules, so the rows and the list disagreed.
--
-- 3. Every list built the whole card (prices, ratings, attendance, the
--    dates as JSON, opening hours) for every listing in the area and then
--    kept 20. On the 100,000-event catalogue "All events" took 0.2 s for
--    10 km and 0.9 s for a whole city, and the "Open now" row of places
--    0.3 s, because place_is_open_now ran for every place in range.
--
-- 4. get_similar_events returned every event of the category in range, in
--    no order; the website sorted and cut afterwards (events with several
--    dates always last) and the app kept whichever 20 came first.
--
-- 5. "Happening today" kept listing a date that was already over.
--
-- 6. A second get_nearby_events with three arguments, unbounded and
--    without the archived filter, was still in the API. It could not even
--    be called (the API cannot choose between the two), and it made the
--    six-argument one fail for a caller that left the optional ones out.
--
-- 7. A date counted for a day only when it started on it. A festival from
--    Friday evening to Sunday was not in "Happening today" on Saturday, not
--    found by the "Today" filter, and in none of the time rows once it had
--    begun, although it was on and its card said so.
--
-- 8. The three time rows repeated each other: "this week" began with
--    today's events and "this month" with this week's, so a busy area
--    showed the same twenty cards three times.
--
-- What this does
--
--   * _explore_event_candidates(...) is the one place that says which
--     events are on and what the filters mean. It returns the id and the
--     position (next date, distance) and nothing else. Every bound is
--     independent; any date that has not ended and falls inside the asked
--     dates counts (it starts by their end, and starts in them or is still
--     running when they begin), and the event is listed under the earliest
--     such date; an event with no tier is free; a type is matched as a
--     whole name; a category by its name. In get_filtered_events an end
--     with no time of day is a whole day.
--   * _event_cards(ids) and _place_cards(ids) build what a card shows, for
--     the chosen rows only. Every event list now returns the same card
--     (per-tier stock, attendance, organizer rating, time zone), so a card
--     says "Sold out" the same way wherever it appears, and the clients no
--     longer fetch attendance or tiers in a second request.
--   * get_filtered_events, get_nearby_events, get_similar_events,
--     get_events_in_window, get_nearby_places and get_filtered_places pick
--     their page from the candidates and then build the cards. Columns are
--     only added, never renamed or removed, so installed app versions keep
--     working. get_nearby_events is soonest first.
--   * get_place_events(place) lists the events at a place by the same
--     rule. The place page read `event` directly and asked for a start in
--     the future, so an event with several dates (which has no start of its
--     own) or one that had begun never showed there.
--   * get_explore_event_sections(...) returns the Explore rows from the
--     whole area in one call, with the reader's filters applied by the same
--     rule as the list: Around you, Happening today / this week / this
--     month, From top-rated organizers, and Featured (paid placement, which
--     the filters do not touch). Each event comes once, with the rows it
--     belongs to and its place in each. A time row leaves out what the time
--     rows before it show, so the three never repeat an event.
--   * "Open now" is asked of places in order of distance until the page is
--     full, instead of for every place in range, as one index lookup a
--     place instead of a call to place_is_open_now.
--   * A page is at most 1,000 rows.
--   * Distances are kilometres to the millimetre. The distance is part of
--     the cursor of "All events" and of the place lists, and the API sends
--     a float with 15 digits: a cursor built from the full value came back
--     a hair smaller than the value it stood for, so about every other
--     page began with the last row of the page before.
--   * idx_event_geo_discoverable leaves archived events out. Archived
--     events are kept for good (see 20261002170000), and every list here
--     asks for archived_at IS NULL, so the index no longer grows with
--     history.
--
-- Compared against the functions they replace on the 100,000-event
-- catalogue (scripts/perf/discovery-explore-perf.sql): the same rows,
-- values and order for every case whose meaning did not change, page by
-- page; timings in docs/architecture/perf/discovery-2026-09.md.

-- ---------------------------------------------------------------------
-- 1. Indexes
-- ---------------------------------------------------------------------
drop index if exists public.idx_event_geo_discoverable;
create index idx_event_geo_discoverable on public.event using gist (location)
  where status = 'published'
    and archived_at is null
    and moderation_state is distinct from 'hidden'
    and moderation_state is distinct from 'removed';

create index if not exists idx_event_featured on public.event (id) where featured;

-- ---------------------------------------------------------------------
-- 2. Which events are on: the one rule
-- ---------------------------------------------------------------------

-- An end date with no time of day is a calendar day sent without one (app
-- versions before 2026-10 send "2026-10-12", which arrives as midnight
-- UTC): it runs to the end of that day. Callers that mean an instant send
-- the last moment of the day and never midnight exactly. The functions the
-- apps send a date filter to (get_filtered_events and the Explore rows)
-- read their end through this; the rule below takes instants.
create or replace function public._explore_day_end(p_end timestamp with time zone)
returns timestamp with time zone
language sql
immutable
set search_path = ''
as $function$
  select case
           when (p_end at time zone 'UTC')::time = time '00:00'
             then p_end + interval '1 day' - interval '1 microsecond'
           else p_end
         end;
$function$;

revoke all on function public._explore_day_end(timestamp with time zone) from public, anon, authenticated;
grant execute on function public._explore_day_end(timestamp with time zone) to service_role;

create or replace function public._explore_event_candidates(
  p_user_lat        double precision,
  p_user_lng        double precision,
  p_max_distance_km double precision,
  p_search_text     text default null,
  p_event_category  text default null,
  p_event_type      text[] default null,
  p_min_price       numeric default null,
  p_max_price       numeric default null,
  p_start_date      timestamp with time zone default null,
  p_end_date        timestamp with time zone default null,
  p_min_rating      numeric default null,
  p_with_distance   boolean default true,
  p_only_ids        uuid[] default null,
  p_place_id        uuid default null
)
returns table (
  id            uuid,
  organizer_id  uuid,
  is_multi_date boolean,
  sort_start    timestamp with time zone,
  distance_km   double precision
)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
set plan_cache_mode to 'force_custom_plan'
as $function$
declare
  v_point    extensions.geography;
  v_radius   double precision;
  v_search   text := nullif(public._search_normalize(p_search_text), '');
  v_like     text;
  v_tsq      tsquery;
  v_category text := nullif(lower(btrim(coalesce(p_event_category, ''))), '');
  v_types    text[];
  v_from     timestamp with time zone := p_start_date;
  v_to       timestamp with time zone := p_end_date;
begin
  if p_user_lat is not null and p_user_lng is not null then
    v_point  := st_setsrid(st_makepoint(p_user_lng, p_user_lat), 4326)::extensions.geography;
    -- A point with no radius is "anywhere, nearest first".
    v_radius := p_max_distance_km * 1000;
  end if;

  if v_search is not null then
    v_like := '%' || public._search_like_escape(v_search) || '%';
    v_tsq  := coalesce(public._search_prefix_tsquery(v_search),
                       public._search_web_tsquery(v_search));
  end if;

  -- event_type holds a JSON list (["Live Concerts","DJ Parties"]); a type
  -- is matched as a whole element, so "Talent Shows" does not also bring
  -- in "Kids Talent Shows".
  select array_agg('%"' || public._search_like_escape(btrim(t)) || '"%')
    into v_types
  from unnest(coalesce(p_event_type, '{}'::text[])) t
  where btrim(coalesce(t, '')) <> '';


  return query
  select
    e.id,
    e.organizer_id,
    occ.total > 0,
    case when occ.total > 0 then occ.next_start else e.starts_at end,
    -- Kilometres to the millimetre. The distance is part of a page's
    -- cursor, and the API sends a float with 15 digits (extra_float_digits
    -- is 0 here): a cursor made from the full value came back a hair
    -- smaller, so the last row of a page was the first of the next.
    case when p_with_distance and v_point is not null
         then round(st_distance(e.location, v_point) * 1000) / 1000000 end
  from event e
  -- The event's own dates, if it has any: how many, and the earliest one
  -- that has not ended and falls inside the asked dates. A date falls
  -- inside when it starts by their end, and starts in them or is still
  -- running when they begin: a festival from Friday to Sunday is on on
  -- Saturday. One that ends at the very moment they begin is not.
  left join lateral (
    select count(*) as total,
           min(o.starts_at) filter (
             where o.ends_at > now()
               and (v_from is null or o.starts_at >= v_from or o.ends_at > v_from)
               and (v_to is null or o.starts_at <= v_to)) as next_start
    from event_occurrence o
    where o.event_id = e.id
  ) occ on true
  where e.status = 'published'
    and e.archived_at is null
    and e.moderation_state is distinct from 'hidden'
    and e.moderation_state is distinct from 'removed'
    and (e.country_code <> all ((select public.hidden_listing_countries())::text[]))
    and (p_only_ids is null or e.id = any (p_only_ids))
    and (p_place_id is null or e.place_id = p_place_id)
    -- With an end date, only events with a date that starts by then, read
    -- from the two start-time indexes, so the planner can start from the
    -- dates or from the area, whichever is smaller ("today" in a big city:
    -- 62 to 16 ms on the test catalogue). A superset of what the rule
    -- below keeps, never the rule itself.
    and (v_to is null or e.id in (
          select e3.id from event e3
          where e3.status = 'published' and e3.archived_at is null
            and e3.starts_at <= v_to
            and (e3.ends_at > now() or e3.ends_at is null)
          union all
          select o3.event_id from event_occurrence o3
          where o3.starts_at <= v_to and o3.ends_at > now()))
    and (v_point is null or v_radius is null or st_dwithin(e.location, v_point, v_radius))
    and (v_like is null
         or e.search_title like v_like escape '\'
         or lower(e.slug) like v_like escape '\'
         or e.search_tsv @@ v_tsq)
    and (v_category is null or lower(e.event_category) = v_category)
    and (v_types is null
         or exists (select 1 from unnest(v_types) t where e.event_type ilike t escape '\'))
    -- Price: a tier inside the bounds; an event with no tier is free.
    and ((p_min_price is null and p_max_price is null)
         or exists (select 1 from ticket_type tt
                    where tt.event_id = e.id
                      and (p_min_price is null or tt.price >= p_min_price)
                      and (p_max_price is null or tt.price <= p_max_price))
         or (coalesce(p_min_price, 0) <= 0 and coalesce(p_max_price, 0) >= 0
             and not exists (select 1 from ticket_type tt where tt.event_id = e.id)))
    and (p_min_rating is null
         or coalesce((select avg(r.rating) from event_review r
                      where r.event_id = e.id
                        and r.status = 'approved'
                        and r.moderation_state is distinct from 'hidden'
                        and r.moderation_state is distinct from 'removed'), 0) >= p_min_rating)
    -- On: a date that has not ended (and falls inside the asked dates).
    and case
          when occ.total > 0 then occ.next_start is not null
          else (e.ends_at > now() or (e.ends_at is null and e.starts_at > now()))
               and (v_from is null or e.starts_at >= v_from or e.ends_at > v_from)
               and (v_to is null or e.starts_at <= v_to)
        end;
end;
$function$;

revoke all on function public._explore_event_candidates(double precision, double precision, double precision, text, text, text[], numeric, numeric, timestamp with time zone, timestamp with time zone, numeric, boolean, uuid[], uuid) from public, anon, authenticated;
grant execute on function public._explore_event_candidates(double precision, double precision, double precision, text, text, text[], numeric, numeric, timestamp with time zone, timestamp with time zone, numeric, boolean, uuid[], uuid) to service_role;

-- ---------------------------------------------------------------------
-- 3. What a card shows, built for chosen events only
-- ---------------------------------------------------------------------
create or replace function public._event_cards(p_ids uuid[])
returns table (
  id                     uuid,
  organizer_id           uuid,
  event_category         text,
  event_type             text,
  title                  text,
  slug                   text,
  description            text,
  location               extensions.geography,
  address                jsonb,
  website_url            text,
  capacity               integer,
  flyer_public_id        text,
  flyer_version          character varying,
  starts_at              timestamp with time zone,
  ends_at                timestamp with time zone,
  status                 character varying,
  created_at             timestamp with time zone,
  event_code             text,
  require_registration   boolean,
  min_price              numeric,
  currency               text,
  occurrences            json,
  featured               boolean,
  attendance_count       bigint,
  ticket_types           json,
  avg_rating             numeric,
  organizer_avg_rating   numeric,
  organizer_rating_count integer,
  timezone               text,
  country_code           text
)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  return query
  with organizer_rating as (
    -- One pass over `review` for the distinct organizers (the predicate of
    -- get_user_rating), not one per event.
    select r.reviewed_id,
           avg(r.rating)::numeric as avg_rating,
           count(*)::integer as rating_count
    from review r
    where r.reviewed_id in (select distinct e2.organizer_id from event e2 where e2.id = any (p_ids))
      and r.status = 'approved'
      and r.moderation_state is distinct from 'hidden'
      and r.moderation_state is distinct from 'removed'
    group by r.reviewed_id
  )
  select
    e.id, e.organizer_id, e.event_category, e.event_type, e.title, e.slug, e.description,
    e.location, e.address, e.website_url, e.capacity, e.flyer_public_id, e.flyer_version,
    e.starts_at, e.ends_at, e.status, e.created_at, e.event_code, e.require_registration,
    tk.min_price,
    e.currency::text,
    oc.occurrences,
    -- Featuring is bought: an active promotion features the event.
    (e.featured or exists (select 1 from event_promotion ep
                           where ep.event_id = e.id and ep.ends_at > now())),
    coalesce(att.attendance_count, 0)::bigint,
    tk.ticket_types,
    coalesce(rv.avg_rating, 0)::numeric,
    orr.avg_rating,
    orr.rating_count,
    e.timezone::text,
    e.country_code::text
  from event e
  left join organizer_rating orr on orr.reviewed_id = e.organizer_id
  left join lateral (
    select min(tt.price) as min_price,
           json_agg(json_build_object('price', tt.price, 'currency', tt.currency, 'quantity', tt.quantity)
                    order by tt.price asc) as ticket_types
    from ticket_type tt
    where tt.event_id = e.id
  ) tk on true
  left join lateral (
    select sum(a.number_of_tickets) as attendance_count
    from attendance a
    where a.event_id = e.id and a.status = 'attending'
  ) att on true
  left join lateral (
    select case
             when count(*) > 0 then
               json_agg(json_build_object('id', o.id, 'starts_at', o.starts_at, 'ends_at', o.ends_at)
                        order by o.starts_at asc)
             else
               json_build_array(json_build_object('id', null, 'starts_at', e.starts_at, 'ends_at', e.ends_at))
           end as occurrences
    from event_occurrence o
    where o.event_id = e.id
  ) oc on true
  left join lateral (
    select avg(r.rating) as avg_rating
    from event_review r
    where r.event_id = e.id
      and r.status = 'approved'
      and r.moderation_state is distinct from 'hidden'
      and r.moderation_state is distinct from 'removed'
  ) rv on true
  where e.id = any (p_ids);
end;
$function$;

revoke all on function public._event_cards(uuid[]) from public, anon, authenticated;
grant execute on function public._event_cards(uuid[]) to service_role;

-- ---------------------------------------------------------------------
-- 4. The filtered list ("All events", the older search)
-- ---------------------------------------------------------------------
drop function if exists public.get_filtered_events(numeric, numeric, timestamp with time zone, timestamp with time zone, double precision, double precision, double precision, text, text, text[], numeric, timestamp with time zone, double precision, uuid, integer);

create function public.get_filtered_events(
  p_min_price          numeric default null,
  p_max_price          numeric default null,
  p_start_date         timestamp with time zone default null,
  p_end_date           timestamp with time zone default null,
  p_user_lat           double precision default null,
  p_user_lng           double precision default null,
  p_max_distance_km    double precision default null,
  p_search_text        text default null,
  p_event_category     text default null,
  p_event_type         text[] default null,
  p_min_rating         numeric default null,
  p_cursor_starts_at   timestamp with time zone default null,
  p_cursor_distance_km double precision default null,
  p_cursor_id          uuid default null,
  p_page_size          integer default 20
)
returns table (
  id               uuid,
  title            text,
  starts_at        timestamp with time zone,
  ends_at          timestamp with time zone,
  address          jsonb,
  min_price        numeric,
  currency         text,
  avg_rating       numeric,
  event_code       text,
  distance_km      double precision,
  flyer_public_id  text,
  flyer_version    character varying,
  capacity         integer,
  attendance_count bigint,
  created_at       timestamp with time zone,
  occurrences      json,
  location         extensions.geography,
  event_category   text,
  status           character varying,
  organizer_id     uuid,
  timezone         text,
  country_code     text,
  slug             text,
  event_type       text,
  featured         boolean,
  ticket_types     json,
  organizer_avg_rating   numeric,
  organizer_rating_count integer
)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_page_size, 20), 1), 1000) + 1;
begin
  return query
  with page as (
    select c.id as event_id, c.sort_start, c.distance_km as km
    from public._explore_event_candidates(
           p_user_lat, p_user_lng, p_max_distance_km, p_search_text, p_event_category,
           p_event_type, p_min_price, p_max_price, p_start_date,
           -- A day sent without a time is that whole day.
           public._explore_day_end(p_end_date), p_min_rating) c
    where p_cursor_id is null
       or (c.sort_start, coalesce(c.distance_km, 1e18::double precision), c.id)
          > (p_cursor_starts_at, coalesce(p_cursor_distance_km, 1e18::double precision), p_cursor_id)
    order by c.sort_start asc, coalesce(c.distance_km, 1e18::double precision) asc, c.id asc
    limit v_limit
  )
  select
    k.id, k.title,
    p.sort_start,
    coalesce(se.ends_at, k.ends_at),
    k.address, k.min_price, k.currency, k.avg_rating, k.event_code,
    p.km,
    k.flyer_public_id, k.flyer_version, k.capacity, k.attendance_count, k.created_at,
    k.occurrences, k.location, k.event_category, k.status, k.organizer_id,
    k.timezone, k.country_code,
    k.slug, k.event_type, k.featured, k.ticket_types,
    coalesce(k.organizer_avg_rating, 0)::numeric,
    coalesce(k.organizer_rating_count, 0)::integer
  from page p
  join public._event_cards(array(select pg.event_id from page pg)) k on k.id = p.event_id
  -- The end of the date the row is listed under.
  left join lateral (
    select o.ends_at
    from event_occurrence o
    where o.event_id = p.event_id and o.starts_at = p.sort_start and o.ends_at > now()
    order by o.ends_at
    limit 1
  ) se on true
  order by p.sort_start asc, coalesce(p.km, 1e18::double precision) asc, p.event_id asc;
end;
$function$;

revoke all on function public.get_filtered_events(numeric, numeric, timestamp with time zone, timestamp with time zone, double precision, double precision, double precision, text, text, text[], numeric, timestamp with time zone, double precision, uuid, integer) from public;
grant execute on function public.get_filtered_events(numeric, numeric, timestamp with time zone, timestamp with time zone, double precision, double precision, double precision, text, text, text[], numeric, timestamp with time zone, double precision, uuid, integer) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. Nearby events, soonest first
-- ---------------------------------------------------------------------
drop function if exists public.get_nearby_events(double precision, double precision, double precision);
drop function if exists public.get_nearby_events(double precision, double precision, double precision, timestamp with time zone, uuid, integer);

create function public.get_nearby_events(
  user_lat          double precision,
  user_lng          double precision,
  search_radius     double precision,
  p_cursor_sort_key timestamp with time zone default null,
  p_cursor_id       uuid default null,
  p_page_size       integer default 20
)
returns table (
  id               uuid,
  organizer_id     uuid,
  event_category   text,
  event_type       text,
  title            text,
  slug             text,
  location         extensions.geography,
  address          jsonb,
  website_url      text,
  capacity         integer,
  flyer_public_id  text,
  flyer_version    character varying,
  starts_at        timestamp with time zone,
  ends_at          timestamp with time zone,
  status           character varying,
  created_at       timestamp with time zone,
  event_code       text,
  min_price        numeric,
  currency         text,
  occurrences      json,
  featured         boolean,
  cursor_sort_key  timestamp with time zone,
  attendance_count bigint,
  ticket_types     json,
  organizer_avg_rating   numeric,
  organizer_rating_count integer,
  timezone         text,
  country_code     text
)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_page_size, 20), 1), 1000) + 1;
begin
  if user_lat is null or user_lng is null or search_radius is null then
    return;
  end if;

  return query
  with page as (
    -- Soonest first: the event's next date that has not ended. (Until
    -- 2026-10 an event with one date had no sort position and came in id
    -- order, after every event with several dates.)
    select c.id as event_id, coalesce(c.sort_start, 'infinity'::timestamptz) as sort_key
    from public._explore_event_candidates(
           user_lat, user_lng, search_radius / 1000.0, p_with_distance => false) c
    where p_cursor_id is null
       or (coalesce(c.sort_start, 'infinity'::timestamptz), c.id) > (p_cursor_sort_key, p_cursor_id)
    order by 2 asc, c.id asc
    limit v_limit
  )
  select
    k.id, k.organizer_id, k.event_category, k.event_type, k.title, k.slug, k.location,
    k.address, k.website_url, k.capacity, k.flyer_public_id, k.flyer_version,
    k.starts_at, k.ends_at, k.status, k.created_at, k.event_code,
    k.min_price, k.currency, k.occurrences, k.featured,
    p.sort_key,
    k.attendance_count, k.ticket_types,
    coalesce(k.organizer_avg_rating, 0)::numeric,
    coalesce(k.organizer_rating_count, 0)::integer,
    k.timezone, k.country_code
  from page p
  join public._event_cards(array(select pg.event_id from page pg)) k on k.id = p.event_id
  order by p.sort_key asc, p.event_id asc;
end;
$function$;

revoke all on function public.get_nearby_events(double precision, double precision, double precision, timestamp with time zone, uuid, integer) from public;
grant execute on function public.get_nearby_events(double precision, double precision, double precision, timestamp with time zone, uuid, integer) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. Similar events: the same category nearby, soonest first, a few
-- ---------------------------------------------------------------------
drop function if exists public.get_similar_events(text, extensions.geography, numeric);

create function public.get_similar_events(
  input_category     text,
  input_location     extensions.geography,
  input_radius_km    numeric,
  p_exclude_event_id uuid default null,
  p_limit            integer default 20
)
returns table (
  id                   uuid,
  organizer_id         uuid,
  event_category       text,
  event_type           text,
  title                text,
  slug                 text,
  description          text,
  location             extensions.geography,
  address              jsonb,
  website_url          text,
  capacity             integer,
  flyer_public_id      text,
  flyer_version        character varying,
  starts_at            timestamp with time zone,
  ends_at              timestamp with time zone,
  status               character varying,
  created_at           timestamp with time zone,
  event_code           text,
  require_registration boolean,
  ticket_price         numeric,
  ticket_currency      text,
  occurrences          json,
  timezone             text,
  country_code         text,
  min_price            numeric,
  currency             text,
  featured             boolean,
  attendance_count     bigint,
  ticket_types         json
)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  if nullif(btrim(coalesce(input_category, '')), '') is null
     or input_location is null or input_radius_km is null then
    return;
  end if;

  return query
  with page as (
    select c.id as event_id, c.sort_start
    from public._explore_event_candidates(
           st_y(input_location::extensions.geometry),
           st_x(input_location::extensions.geometry),
           input_radius_km::double precision,
           p_event_category => input_category,
           p_with_distance => false) c
    where p_exclude_event_id is null or c.id <> p_exclude_event_id
    order by c.sort_start asc nulls last, c.id asc
    limit v_limit
  )
  select
    k.id, k.organizer_id, k.event_category, k.event_type, k.title, k.slug, k.description,
    k.location, k.address, k.website_url, k.capacity, k.flyer_public_id, k.flyer_version,
    k.starts_at, k.ends_at, k.status, k.created_at, k.event_code, k.require_registration,
    k.min_price, k.currency, k.occurrences, k.timezone, k.country_code,
    k.min_price, k.currency, k.featured, k.attendance_count, k.ticket_types
  from page p
  join public._event_cards(array(select pg.event_id from page pg)) k on k.id = p.event_id
  order by p.sort_start asc nulls last, p.event_id asc;
end;
$function$;

revoke all on function public.get_similar_events(text, extensions.geography, numeric, uuid, integer) from public;
grant execute on function public.get_similar_events(text, extensions.geography, numeric, uuid, integer) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6b. The events at a place, soonest first
-- ---------------------------------------------------------------------
-- A place page listed its events with a plain read of `event` that asked
-- for starts_at in the future: an event with several dates has no start of
-- its own, so it never appeared there, and neither did one that had begun.
create or replace function public.get_place_events(
  p_place_id uuid,
  p_limit    integer default 12
)
returns table (
  id               uuid,
  organizer_id     uuid,
  event_category   text,
  event_type       text,
  title            text,
  slug             text,
  location         extensions.geography,
  address          jsonb,
  website_url      text,
  capacity         integer,
  flyer_public_id  text,
  flyer_version    character varying,
  starts_at        timestamp with time zone,
  ends_at          timestamp with time zone,
  status           character varying,
  created_at       timestamp with time zone,
  event_code       text,
  min_price        numeric,
  currency         text,
  occurrences      json,
  featured         boolean,
  attendance_count bigint,
  ticket_types     json,
  avg_rating       numeric,
  organizer_avg_rating   numeric,
  organizer_rating_count integer,
  timezone         text,
  country_code     text
)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 100);
begin
  if p_place_id is null then
    return;
  end if;

  return query
  with page as (
    select c.id as event_id, c.sort_start
    from public._explore_event_candidates(
           null, null, null, p_with_distance => false, p_place_id => p_place_id) c
    order by c.sort_start asc nulls last, c.id asc
    limit v_limit
  )
  select
    k.id, k.organizer_id, k.event_category, k.event_type, k.title, k.slug, k.location,
    k.address, k.website_url, k.capacity, k.flyer_public_id, k.flyer_version,
    k.starts_at, k.ends_at, k.status, k.created_at, k.event_code,
    k.min_price, k.currency, k.occurrences, k.featured, k.attendance_count, k.ticket_types,
    k.avg_rating,
    coalesce(k.organizer_avg_rating, 0)::numeric,
    coalesce(k.organizer_rating_count, 0)::integer,
    k.timezone, k.country_code
  from page p
  join public._event_cards(array(select pg.event_id from page pg)) k on k.id = p.event_id
  order by p.sort_start asc nulls last, p.event_id asc;
end;
$function$;

revoke all on function public.get_place_events(uuid, integer) from public;
grant execute on function public.get_place_events(uuid, integer) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7. Events inside a time window ("Happening today / this week / …")
-- ---------------------------------------------------------------------
-- The window's two ends are instants, taken as they are.
drop function if exists public.get_events_in_window(double precision, double precision, double precision, timestamp with time zone, timestamp with time zone, timestamp with time zone, uuid, integer);

create function public.get_events_in_window(
  p_user_lat         double precision,
  p_user_lng         double precision,
  p_radius_km        double precision,
  p_window_start     timestamp with time zone,
  p_window_end       timestamp with time zone,
  p_cursor_starts_at timestamp with time zone default null,
  p_cursor_id        uuid default null,
  p_page_size        integer default 20
)
returns table (
  id               uuid,
  organizer_id     uuid,
  event_category   text,
  event_type       text,
  title            text,
  slug             text,
  description      text,
  location         extensions.geography,
  address          jsonb,
  website_url      text,
  capacity         integer,
  flyer_public_id  text,
  flyer_version    character varying,
  starts_at        timestamp with time zone,
  ends_at          timestamp with time zone,
  status           character varying,
  created_at       timestamp with time zone,
  event_code       text,
  min_price        numeric,
  currency         text,
  occurrences      json,
  featured         boolean,
  timezone         text,
  country_code     text,
  attendance_count bigint,
  ticket_types     json
)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_page_size, 20), 1), 1000) + 1;
begin
  return query
  with page as (
    -- The same rule as every other list, with the window as its dates: an
    -- event is listed under its earliest date that has not ended and falls
    -- inside the window, so one that began before it and is still running
    -- is "happening" too. (Until 2026-10 this only knew dates that start
    -- inside the window.) The rule reads the start-time indexes when there
    -- is an end date, as this function did before.
    select c.id as event_id, c.sort_start
    from public._explore_event_candidates(
           p_user_lat, p_user_lng, p_radius_km,
           p_start_date => p_window_start, p_end_date => p_window_end,
           p_with_distance => false) c
    where p_cursor_id is null
       or (c.sort_start, c.id) > (p_cursor_starts_at, p_cursor_id)
    order by c.sort_start asc, c.id asc
    limit v_limit
  )
  select
    k.id, k.organizer_id, k.event_category, k.event_type, k.title, k.slug, k.description,
    k.location, k.address, k.website_url, k.capacity, k.flyer_public_id, k.flyer_version,
    p.sort_start,
    coalesce(se.ends_at, k.ends_at),
    k.status, k.created_at, k.event_code, k.min_price, k.currency, k.occurrences,
    k.featured, k.timezone, k.country_code, k.attendance_count, k.ticket_types
  from page p
  join public._event_cards(array(select pg.event_id from page pg)) k on k.id = p.event_id
  -- The end of the date the row is listed under.
  left join lateral (
    select o.ends_at
    from event_occurrence o
    where o.event_id = p.event_id and o.starts_at = p.sort_start and o.ends_at > now()
    order by o.ends_at
    limit 1
  ) se on true
  order by p.sort_start asc, p.event_id asc;
end;
$function$;

revoke all on function public.get_events_in_window(double precision, double precision, double precision, timestamp with time zone, timestamp with time zone, timestamp with time zone, uuid, integer) from public;
grant execute on function public.get_events_in_window(double precision, double precision, double precision, timestamp with time zone, timestamp with time zone, timestamp with time zone, uuid, integer) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8. The Explore rows, each from the whole area
-- ---------------------------------------------------------------------
create or replace function public.get_explore_event_sections(
  p_user_lat       double precision,
  p_user_lng       double precision,
  p_radius_km      double precision default 10,
  p_around_km      double precision default 5,
  p_today_end      timestamp with time zone default null,
  p_month_end      timestamp with time zone default null,
  p_event_category text default null,
  p_event_type     text[] default null,
  p_min_price      numeric default null,
  p_max_price      numeric default null,
  p_start_date     timestamp with time zone default null,
  p_end_date       timestamp with time zone default null,
  p_min_rating     numeric default null,
  p_section_size   integer default 20,
  p_sections       text[] default null
)
returns table (
  id               uuid,
  organizer_id     uuid,
  event_category   text,
  event_type       text,
  title            text,
  slug             text,
  location         extensions.geography,
  address          jsonb,
  website_url      text,
  capacity         integer,
  flyer_public_id  text,
  flyer_version    character varying,
  starts_at        timestamp with time zone,
  ends_at          timestamp with time zone,
  status           character varying,
  created_at       timestamp with time zone,
  event_code       text,
  min_price        numeric,
  currency         text,
  occurrences      json,
  featured         boolean,
  attendance_count bigint,
  ticket_types     json,
  avg_rating       numeric,
  organizer_avg_rating   numeric,
  organizer_rating_count integer,
  timezone         text,
  country_code     text,
  sections         jsonb
)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_size integer := least(greatest(coalesce(p_section_size, 20), 1), 60);
  v_want text[] := coalesce(p_sections, array[
    'featured', 'aroundYou', 'topRatedOrganizers',
    'happeningToday', 'happeningThisWeek', 'happeningThisMonth']);
  v_around double precision := least(coalesce(p_around_km, p_radius_km), p_radius_km);
  v_from   timestamp with time zone := p_start_date;
  v_to     timestamp with time zone := public._explore_day_end(p_end_date);
  v_promoted uuid[];
begin
  if p_user_lat is null or p_user_lng is null or p_radius_km is null then
    return;
  end if;

  -- Featuring is bought (an active promotion); `featured` is the older,
  -- staff-set flag. Both are few, so they are looked up by id.
  if 'featured' = any (v_want) then
    select array_agg(x.event_id) into v_promoted
    from (
      select ep.event_id from event_promotion ep where ep.ends_at > now()
      union
      select e.id from event e where e.featured
    ) x;
  end if;

  return query
  with cand as materialized (
    select c.id as event_id, c.organizer_id as organizer, c.is_multi_date, c.sort_start, c.distance_km as km
    from public._explore_event_candidates(
           p_user_lat, p_user_lng, p_radius_km, null, p_event_category, p_event_type,
           p_min_price, p_max_price, v_from, v_to, p_min_rating) c
  ),
  -- Every date of those events that has not ended (inside the asked dates).
  sess as materialized (
    select c.event_id, c.sort_start as session_start
    from cand c
    where not c.is_multi_date and c.sort_start is not null
    union all
    select c.event_id, o.starts_at
    from cand c
    join event_occurrence o on o.event_id = c.event_id
    where c.is_multi_date
      and o.ends_at > now()
      and (v_from is null or o.starts_at >= v_from or o.ends_at > v_from)
      and (v_to is null or o.starts_at <= v_to)
  ),
  around as (
    select c.event_id, c.sort_start
    from cand c
    where 'aroundYou' = any (v_want) and c.km <= v_around
    order by c.sort_start asc nulls last, c.event_id asc
    limit v_size
  ),
  -- The time rows. None of these dates has ended, so a date is on in a
  -- stretch that begins now (or earlier today) when it starts by the end
  -- of it: under way since yesterday counts for today. Each row leaves out
  -- what the rows before it show, so the three never repeat an event; the
  -- list behind a row ("See all") is the whole stretch.
  today as (
    select s.event_id, min(s.session_start) as first_start
    from sess s
    where 'happeningToday' = any (v_want)
      and s.session_start <= p_today_end
    group by s.event_id
    order by 2 asc, s.event_id asc
    limit v_size
  ),
  week as (
    select s.event_id, min(s.session_start) as first_start
    from sess s
    where 'happeningThisWeek' = any (v_want)
      and s.session_start <= now() + interval '7 days'
      and s.event_id not in (select t.event_id from today t)
    group by s.event_id
    order by 2 asc, s.event_id asc
    limit v_size
  ),
  month as (
    select s.event_id, min(s.session_start) as first_start
    from sess s
    where 'happeningThisMonth' = any (v_want)
      and s.session_start <= p_month_end
      and s.event_id not in (select t.event_id from today t)
      and s.event_id not in (select w.event_id from week w)
    group by s.event_id
    order by 2 asc, s.event_id asc
    limit v_size
  ),
  -- Organizers of those events with at least one visible review, best
  -- rated first (the predicate of get_user_rating).
  org as (
    select r.reviewed_id, avg(r.rating)::numeric as rating, count(*)::integer as reviews
    from review r
    where 'topRatedOrganizers' = any (v_want)
      and r.reviewed_id in (select distinct c.organizer from cand c)
      and r.status = 'approved'
      and r.moderation_state is distinct from 'hidden'
      and r.moderation_state is distinct from 'removed'
    group by r.reviewed_id
  ),
  top as (
    select c.event_id, g.rating, g.reviews, c.sort_start
    from cand c
    join org g on g.reviewed_id = c.organizer
    order by g.rating desc, g.reviews desc, c.sort_start asc nulls last, c.event_id asc
    limit v_size
  ),
  -- Paid placement is not a search result: the reader's filters do not
  -- apply to it. Only events with a date still ahead and none under way.
  feat as (
    select f.id as event_id, f.sort_start
    from public._explore_event_candidates(
           p_user_lat, p_user_lng, p_radius_km,
           p_with_distance => false, p_only_ids => coalesce(v_promoted, '{}'::uuid[])) f
    where f.sort_start > now()
    order by f.sort_start asc, f.id asc
    limit v_size
  ),
  placed as (
    select x.event_id, 'featured'::text as section,
           row_number() over (order by x.sort_start, x.event_id) as pos from feat x
    union all
    select x.event_id, 'aroundYou',
           row_number() over (order by x.sort_start nulls last, x.event_id) from around x
    union all
    select x.event_id, 'topRatedOrganizers',
           row_number() over (order by x.rating desc, x.reviews desc, x.sort_start nulls last, x.event_id) from top x
    union all
    select x.event_id, 'happeningToday',
           row_number() over (order by x.first_start, x.event_id) from today x
    union all
    select x.event_id, 'happeningThisWeek',
           row_number() over (order by x.first_start, x.event_id) from week x
    union all
    select x.event_id, 'happeningThisMonth',
           row_number() over (order by x.first_start, x.event_id) from month x
  ),
  picked as (
    select pl.event_id, jsonb_object_agg(pl.section, pl.pos) as in_sections
    from placed pl
    group by pl.event_id
  )
  select
    k.id, k.organizer_id, k.event_category, k.event_type, k.title, k.slug, k.location,
    k.address, k.website_url, k.capacity, k.flyer_public_id, k.flyer_version,
    k.starts_at, k.ends_at, k.status, k.created_at, k.event_code,
    k.min_price, k.currency, k.occurrences, k.featured, k.attendance_count, k.ticket_types,
    k.avg_rating,
    coalesce(k.organizer_avg_rating, 0)::numeric,
    coalesce(k.organizer_rating_count, 0)::integer,
    k.timezone, k.country_code,
    p.in_sections
  from picked p
  join public._event_cards(array(select pk.event_id from picked pk)) k on k.id = p.event_id;
end;
$function$;

revoke all on function public.get_explore_event_sections(double precision, double precision, double precision, double precision, timestamp with time zone, timestamp with time zone, text, text[], numeric, numeric, timestamp with time zone, timestamp with time zone, numeric, integer, text[]) from public;
grant execute on function public.get_explore_event_sections(double precision, double precision, double precision, double precision, timestamp with time zone, timestamp with time zone, text, text[], numeric, numeric, timestamp with time zone, timestamp with time zone, numeric, integer, text[]) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 9. Places: the page first, then what its cards show
-- ---------------------------------------------------------------------

-- What a place card shows, for chosen places only, in the order given.
create or replace function public._place_cards(p_ids uuid[], p_km double precision[])
returns table (
  id                 uuid,
  owner_id           uuid,
  name               text,
  slug               text,
  description        text,
  category_id        smallint,
  category_name      text,
  category_slug      text,
  location           extensions.geography,
  address            jsonb,
  website_url        text,
  phone              text,
  whatsapp           text,
  cover_public_id    text,
  cover_version      character varying,
  status             text,
  temporary_status   text,
  claimed            boolean,
  verified           boolean,
  created_at         timestamp with time zone,
  avg_rating         numeric,
  review_count       bigint,
  is_open            boolean,
  distance_km        double precision,
  list_position      bigint
)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  return query
  select
    p.id, p.owner_id, p.name, p.slug, p.description, p.category_id,
    pc.name, pc.slug,
    p.location, p.address, p.website_url, p.phone, p.whatsapp,
    p.cover_public_id, p.cover_version, p.status, p.temporary_status,
    p.claimed, p.verified, p.created_at,
    rv.avg_rating, rv.review_count,
    public.place_is_open_now(p.id),
    pg.km,
    pg.ord
  from unnest(p_ids, p_km) with ordinality as pg(place_id, km, ord)
  join place p on p.id = pg.place_id
  join place_category pc on pc.id = p.category_id
  left join lateral (
    select avg(r.rating)::numeric as avg_rating, count(*) as review_count
    from place_review r
    where r.place_id = p.id
      and r.status = 'approved'
      and r.moderation_state is distinct from 'hidden'
      and r.moderation_state is distinct from 'removed'
  ) rv on true;
end;
$function$;

revoke all on function public._place_cards(uuid[], double precision[]) from public, anon, authenticated;
grant execute on function public._place_cards(uuid[], double precision[]) to service_role;

create or replace function public.get_nearby_places(
  user_lat          double precision,
  user_lng          double precision,
  search_radius     double precision,
  p_cursor_distance double precision default null,
  p_cursor_id       uuid default null,
  p_page_size       integer default 20
)
returns table (
  id uuid, owner_id uuid, name text, slug text, description text, category_id smallint,
  category_name text, category_slug text, location extensions.geography, address jsonb,
  website_url text, phone text, whatsapp text, cover_public_id text,
  cover_version character varying, status text, temporary_status text, claimed boolean,
  verified boolean, created_at timestamp with time zone, avg_rating numeric,
  review_count bigint, is_open boolean, distance_km double precision,
  cursor_distance_km double precision
)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
set plan_cache_mode to 'force_custom_plan'
as $function$
declare
  v_point extensions.geography;
  v_limit integer := least(greatest(coalesce(p_page_size, 20), 1), 1000) + 1;
  v_ids   uuid[];
  v_km    double precision[];
begin
  if user_lat is null or user_lng is null or search_radius is null then
    return;
  end if;
  v_point := st_setsrid(st_makepoint(user_lng, user_lat), 4326)::extensions.geography;

  -- Nearest first: only the distance is worked out for every place in
  -- range; ratings and opening hours are read for the page.
  select array_agg(s.place_id order by s.km, s.place_id), array_agg(s.km order by s.km, s.place_id)
    into v_ids, v_km
  from (
    select c.place_id, c.km
    from (
      -- Kilometres to the millimetre: see _explore_event_candidates.
      select p.id as place_id,
             round(st_distance(p.location, v_point) * 1000) / 1000000 as km
      from place p
      where p.status = 'published'
        and p.moderation_state is distinct from 'hidden'
        and p.moderation_state is distinct from 'removed'
        and (p.country_code <> all ((select public.hidden_listing_countries())::text[]))
        and st_dwithin(p.location, v_point, search_radius)
    ) c
    where p_cursor_id is null or (c.km, c.place_id) > (p_cursor_distance, p_cursor_id)
    order by c.km asc, c.place_id asc
    limit v_limit
  ) s;

  return query
  select k.id, k.owner_id, k.name, k.slug, k.description, k.category_id,
         k.category_name, k.category_slug, k.location, k.address, k.website_url,
         k.phone, k.whatsapp, k.cover_public_id, k.cover_version, k.status,
         k.temporary_status, k.claimed, k.verified, k.created_at,
         k.avg_rating, k.review_count, k.is_open, k.distance_km,
         k.distance_km
  from public._place_cards(coalesce(v_ids, '{}'::uuid[]), coalesce(v_km, '{}'::double precision[])) k
  order by k.list_position;
end;
$function$;

create or replace function public.get_filtered_places(
  p_search_text     text default null,
  p_category_id     smallint default null,
  p_min_rating      numeric default null,
  p_open_now        boolean default null,
  p_user_lat        double precision default null,
  p_user_lng        double precision default null,
  p_max_distance_km double precision default null,
  p_cursor_distance double precision default null,
  p_cursor_id       uuid default null,
  p_page_size       integer default 20
)
returns table (
  id uuid, owner_id uuid, name text, slug text, description text, category_id smallint,
  category_name text, category_slug text, location extensions.geography, address jsonb,
  website_url text, phone text, whatsapp text, cover_public_id text,
  cover_version character varying, status text, temporary_status text, claimed boolean,
  verified boolean, created_at timestamp with time zone, avg_rating numeric,
  review_count bigint, is_open boolean, distance_km double precision,
  cursor_distance_km double precision
)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
set plan_cache_mode to 'force_custom_plan'
as $function$
declare
  -- The typed text as search compares it (folded): a pattern for the
  -- stored folded name, and a query for the search document (every word,
  -- the last one as a prefix).
  v_search text := nullif(public._search_normalize(p_search_text), '');
  v_like   text;
  v_tsq    tsquery;
  v_point  extensions.geography;
  v_limit  integer := least(greatest(coalesce(p_page_size, 20), 1), 1000) + 1;
  v_ids    uuid[];
  v_km     double precision[];
begin
  if v_search is not null then
    v_like := '%' || public._search_like_escape(v_search) || '%';
    v_tsq  := coalesce(public._search_prefix_tsquery(v_search),
                       public._search_web_tsquery(v_search));
  end if;
  if p_user_lat is not null and p_user_lng is not null then
    v_point := st_setsrid(st_makepoint(p_user_lng, p_user_lat), 4326)::extensions.geography;
  end if;

  -- Nearest first. Only what decides the order and the asked filters is
  -- worked out for every place in range. "Open now" is the costly one
  -- (opening hours on the place's own clock), so it is asked of the
  -- places in order, nearest first, until the page is full.
  select array_agg(s.place_id order by s.sort_km, s.place_id), array_agg(s.km order by s.sort_km, s.place_id)
    into v_ids, v_km
  from (
    select n.place_id, n.km, n.sort_km
    from (
      select c.place_id, c.km, coalesce(c.km, 0) as sort_km, c.temporary_status, c.timezone
      from (
        select p.id as place_id, p.temporary_status, p.timezone,
               -- Kilometres to the millimetre: see _explore_event_candidates.
               case when v_point is not null
                    then round(st_distance(p.location, v_point) * 1000) / 1000000 end as km
        from place p
        where p.status = 'published'
          and p.moderation_state is distinct from 'hidden'
          and p.moderation_state is distinct from 'removed'
          and (p.country_code <> all ((select public.hidden_listing_countries())::text[]))
          and (p_category_id is null or p.category_id = p_category_id)
          and (v_like is null
               or p.search_name like v_like escape '\'
               or p.search_tsv @@ v_tsq)
          and (p_min_rating is null
               or coalesce((select avg(r.rating)::numeric from place_review r
                            where r.place_id = p.id
                              and r.status = 'approved'
                              and r.moderation_state is distinct from 'hidden'
                              and r.moderation_state is distinct from 'removed'), 0) >= p_min_rating)
          and (p_max_distance_km is null or v_point is null
               or st_dwithin(p.location, v_point, p_max_distance_km * 1000))
      ) c
      where p_cursor_id is null or (coalesce(c.km, 0), c.place_id) > (p_cursor_distance, p_cursor_id)
      order by coalesce(c.km, 0) asc, c.place_id asc
      -- Keeps the order below the "open now" check, so it runs in order.
      offset 0
    ) n
    -- "Open now": the rule of place_is_open_now (closed while a temporary
    -- status is set; today's hours on the place's own clock, or overnight
    -- hours that began yesterday), written here as one index lookup per
    -- place instead of a function call (about 60 microseconds a place).
    -- When few places are open, at night, every place in range is asked:
    -- 1,400 closed places took 79 ms with the call and take 8 ms. The
    -- cards still use place_is_open_now; explore-lists.integration.test.ts
    -- checks the two agree for every kind of opening hours.
    where p_open_now is not true
       or (n.temporary_status is null
           and exists (
             select 1
             from (select now() at time zone coalesce(nullif(n.timezone, ''), 'UTC') as at_local) l
             join place_opening_hours h
               on h.place_id = n.place_id
              and h.day_of_week in (extract(dow from l.at_local)::smallint,
                                    ((extract(dow from l.at_local)::integer + 6) % 7)::smallint)
             where not h.is_closed
               and case
                     when h.day_of_week = extract(dow from l.at_local)::smallint then
                       (h.close_time > h.open_time and l.at_local::time between h.open_time and h.close_time)
                       or (h.close_time <= h.open_time and l.at_local::time >= h.open_time)
                     -- Yesterday's hours that run past midnight.
                     else h.close_time <= h.open_time and l.at_local::time < h.close_time
                   end))
    limit v_limit
  ) s;

  return query
  select k.id, k.owner_id, k.name, k.slug, k.description, k.category_id,
         k.category_name, k.category_slug, k.location, k.address, k.website_url,
         k.phone, k.whatsapp, k.cover_public_id, k.cover_version, k.status,
         k.temporary_status, k.claimed, k.verified, k.created_at,
         k.avg_rating, k.review_count, k.is_open, k.distance_km,
         coalesce(k.distance_km, 0)
  from public._place_cards(coalesce(v_ids, '{}'::uuid[]), coalesce(v_km, '{}'::double precision[])) k
  order by k.list_position;
end;
$function$;

comment on function public._explore_event_candidates(double precision, double precision, double precision, text, text, text[], numeric, numeric, timestamp with time zone, timestamp with time zone, numeric, boolean, uuid[], uuid) is
  'Which events are on, and what the Explore filters mean: the one rule every event list reads. '
  'Returns ids with their next date and distance only; cards are built by _event_cards for the chosen rows.';
comment on function public._event_cards(uuid[]) is
  'What an event card shows (price, per-tier stock, attendance, dates, ratings, time zone) for the given events only.';
comment on function public._place_cards(uuid[], double precision[]) is
  'What a place card shows (category, rating, open now) for the given places only, in the order given.';
comment on function public.get_explore_event_sections(double precision, double precision, double precision, double precision, timestamp with time zone, timestamp with time zone, text, text[], numeric, numeric, timestamp with time zone, timestamp with time zone, numeric, integer, text[]) is
  'The Explore rows of events for an area in one call: aroundYou, happeningToday, happeningThisWeek, '
  'happeningThisMonth, topRatedOrganizers (the reader''s filters applied) and featured (paid placement, unfiltered). '
  'One row per event; `sections` maps each row it belongs to onto its position there. '
  'A time row leaves out the events the time rows before it show.';

-- ---------------------------------------------------------------------
-- 10. Checks
-- ---------------------------------------------------------------------
do $$
declare
  v_fn text;
begin
  if to_regprocedure('public.get_nearby_events(double precision, double precision, double precision)') is not null then
    raise exception 'migration check: the three-argument get_nearby_events is still there';
  end if;

  -- The lists are public; what they are built from is not.
  foreach v_fn in array array[
    'public.get_filtered_events(numeric, numeric, timestamp with time zone, timestamp with time zone, double precision, double precision, double precision, text, text, text[], numeric, timestamp with time zone, double precision, uuid, integer)',
    'public.get_nearby_events(double precision, double precision, double precision, timestamp with time zone, uuid, integer)',
    'public.get_similar_events(text, extensions.geography, numeric, uuid, integer)',
    'public.get_events_in_window(double precision, double precision, double precision, timestamp with time zone, timestamp with time zone, timestamp with time zone, uuid, integer)',
    'public.get_place_events(uuid, integer)',
    'public.get_explore_event_sections(double precision, double precision, double precision, double precision, timestamp with time zone, timestamp with time zone, text, text[], numeric, numeric, timestamp with time zone, timestamp with time zone, numeric, integer, text[])',
    'public.get_nearby_places(double precision, double precision, double precision, double precision, uuid, integer)',
    'public.get_filtered_places(text, smallint, numeric, boolean, double precision, double precision, double precision, double precision, uuid, integer)'
  ] loop
    if to_regprocedure(v_fn) is null then
      raise exception 'migration check: % is missing', v_fn;
    end if;
    if not has_function_privilege('anon', v_fn, 'execute')
       or not has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'migration check: % cannot be called by the apps', v_fn;
    end if;
    if not (select p.prosecdef from pg_proc p where p.oid = to_regprocedure(v_fn)) then
      raise exception 'migration check: % must be SECURITY DEFINER (it reads service-only tables)', v_fn;
    end if;
  end loop;

  foreach v_fn in array array[
    'public._explore_event_candidates(double precision, double precision, double precision, text, text, text[], numeric, numeric, timestamp with time zone, timestamp with time zone, numeric, boolean, uuid[], uuid)',
    'public._event_cards(uuid[])',
    'public._place_cards(uuid[], double precision[])',
    'public._explore_day_end(timestamp with time zone)'
  ] loop
    if has_function_privilege('anon', v_fn, 'execute')
       or has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'migration check: % must not be callable by the apps', v_fn;
    end if;
  end loop;

  -- An end with no time of day is a whole day; an instant is left alone.
  if public._explore_day_end('2026-10-12 00:00:00+00') <> '2026-10-12 23:59:59.999999+00'
     or public._explore_day_end('2026-10-12 22:59:59.999+00') <> '2026-10-12 22:59:59.999+00'
     or public._explore_day_end(null) is not null then
    raise exception 'migration check: _explore_day_end does not read a bare day as a whole day';
  end if;
end
$$;
