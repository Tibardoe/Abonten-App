-- Explore: the place rows in one call.
--
-- What was wrong
--
-- The Places tab of Explore asked the database four times on every visit:
-- "Around you", "Open now", "Top rated" and the first page of "All
-- places", each a get_filtered_places call that found every place in range
-- again. The page renders both tabs, so every Explore visit made those
-- calls, next to the events'. On 2 November 2026 the database had two short
-- slow moments (every query five to ten times slower for a few seconds);
-- the calls of signed-out visitors, which are stopped after 3 seconds, were
-- stopped, and the page said there were no places.
--
-- What this does
--
--   * get_explore_place_sections(...) returns the three rows from one pass
--     over the places in range, with the reader's filters, by the rule of
--     get_filtered_places (the list behind them): published and visible, in
--     a market that is live, of the chosen category, rated at least the
--     asked rating, open now on the place's own clock when asked, nearest
--     first. Each place comes once, with the rows it belongs to and its
--     place in each, like get_explore_event_sections.
--       aroundYou  the nearest within p_around_km (never wider than the
--                  area);
--       openNow    the nearest that are open now;
--       topRated   of the nearest rated at least p_top_rated_min (and the
--                  reader's rating), the best rated first.
--     "All places" keeps its own call (get_filtered_places): it pages on.
--   * The cards are built by _place_cards for the chosen places only.

create or replace function public.get_explore_place_sections(
  p_user_lat       double precision default null,
  p_user_lng       double precision default null,
  p_radius_km      double precision default 20,
  p_around_km      double precision default 5,
  p_category_id    smallint default null,
  p_min_rating     numeric default null,
  p_open_now       boolean default null,
  p_top_rated_min  numeric default 4,
  p_around_size    integer default 20,
  p_open_now_size  integer default 10,
  p_top_rated_size integer default 20
)
returns table (
  id uuid, owner_id uuid, name text, slug text, description text, category_id smallint,
  category_name text, category_slug text, location extensions.geography, address jsonb,
  website_url text, phone text, whatsapp text, cover_public_id text,
  cover_version character varying, status text, temporary_status text, claimed boolean,
  verified boolean, created_at timestamp with time zone, avg_rating numeric,
  review_count bigint, is_open boolean, distance_km double precision,
  sections jsonb
)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
set plan_cache_mode to 'force_custom_plan'
as $function$
declare
  v_point     extensions.geography;
  v_around    integer := least(greatest(coalesce(p_around_size, 20), 1), 60);
  v_open      integer := least(greatest(coalesce(p_open_now_size, 10), 1), 60);
  v_top       integer := least(greatest(coalesce(p_top_rated_size, 20), 1), 60);
  -- least() skips a null: with no area the "around you" distance stands.
  v_around_km double precision := least(p_around_km, p_radius_km);
  v_top_min   numeric := greatest(coalesce(p_top_rated_min, 0), coalesce(p_min_rating, 0));
  v_ids       uuid[];
  v_km        double precision[];
  v_in        jsonb[];
begin
  if p_user_lat is not null and p_user_lng is not null then
    v_point := st_setsrid(st_makepoint(p_user_lng, p_user_lat), 4326)::extensions.geography;
  end if;

  with cand as materialized (
    -- Every place in the area that the reader's filters let through, as
    -- get_filtered_places finds them. Without a point (the address could
    -- not be placed) there is no distance and no area, as there.
    select p.id as place_id, p.temporary_status, p.timezone,
           -- Kilometres to the millimetre: see _explore_event_candidates.
           case when v_point is not null
                then round(st_distance(p.location, v_point) * 1000) / 1000000 end as km,
           (v_around_km is null or v_point is null
            or st_dwithin(p.location, v_point, v_around_km * 1000)) as near
    from place p
    where p.status = 'published'
      and p.moderation_state is distinct from 'hidden'
      and p.moderation_state is distinct from 'removed'
      and (p.country_code <> all ((select public.hidden_listing_countries())::text[]))
      and (p_category_id is null or p.category_id = p_category_id)
      and (p_radius_km is null or v_point is null
           or st_dwithin(p.location, v_point, p_radius_km * 1000))
  ),
  rated as materialized (
    -- The rating a card shows (approved, visible reviews), 0 with none.
    select c.place_id, c.km, coalesce(c.km, 0) as sort_km, c.near,
           c.temporary_status, c.timezone, coalesce(r.rating, 0) as rating
    from cand c
    left join (
      select pr.place_id, avg(pr.rating)::numeric as rating
      from place_review pr
      where pr.place_id in (select c2.place_id from cand c2)
        and pr.status = 'approved'
        and pr.moderation_state is distinct from 'hidden'
        and pr.moderation_state is distinct from 'removed'
      group by pr.place_id
    ) r on r.place_id = c.place_id
    where p_min_rating is null or coalesce(r.rating, 0) >= p_min_rating
  ),
  flagged as materialized (
    -- "Open now" by the rule of place_is_open_now, written as in
    -- get_filtered_places (one index lookup a place): closed while a
    -- temporary status is set; today's hours on the place's own clock, or
    -- yesterday's that run past midnight.
    select r.*,
           (r.temporary_status is null
            and exists (
              select 1
              from (select now() at time zone coalesce(nullif(r.timezone, ''), 'UTC') as at_local) l
              join place_opening_hours h
                on h.place_id = r.place_id
               and h.day_of_week in (extract(dow from l.at_local)::smallint,
                                     ((extract(dow from l.at_local)::integer + 6) % 7)::smallint)
              where not h.is_closed
                and case
                      when h.day_of_week = extract(dow from l.at_local)::smallint then
                        (h.close_time > h.open_time and l.at_local::time between h.open_time and h.close_time)
                        or (h.close_time <= h.open_time and l.at_local::time >= h.open_time)
                      else h.close_time <= h.open_time and l.at_local::time < h.close_time
                    end)) as open_now
    from rated r
  ),
  base as (
    select f.* from flagged f where p_open_now is not true or f.open_now
  ),
  around as (
    select b.place_id, b.sort_km
    from base b
    where b.near
    order by b.sort_km asc, b.place_id asc
    limit v_around
  ),
  opened as (
    select b.place_id, b.sort_km
    from base b
    where b.open_now
    order by b.sort_km asc, b.place_id asc
    limit v_open
  ),
  top as (
    select b.place_id, b.sort_km, b.rating
    from base b
    where b.rating >= v_top_min
    order by b.sort_km asc, b.place_id asc
    limit v_top
  ),
  placed as (
    select x.place_id, 'aroundYou'::text as section,
           row_number() over (order by x.sort_km, x.place_id) as pos from around x
    union all
    select x.place_id, 'openNow',
           row_number() over (order by x.sort_km, x.place_id) from opened x
    union all
    select x.place_id, 'topRated',
           row_number() over (order by x.rating desc, x.sort_km, x.place_id) from top x
  ),
  picked as (
    select pl.place_id, jsonb_object_agg(pl.section, pl.pos) as in_sections
    from placed pl
    group by pl.place_id
  )
  select array_agg(pk.place_id order by f.sort_km, pk.place_id),
         array_agg(f.km order by f.sort_km, pk.place_id),
         array_agg(pk.in_sections order by f.sort_km, pk.place_id)
    into v_ids, v_km, v_in
  from picked pk
  join flagged f on f.place_id = pk.place_id;

  return query
  select k.id, k.owner_id, k.name, k.slug, k.description, k.category_id,
         k.category_name, k.category_slug, k.location, k.address, k.website_url,
         k.phone, k.whatsapp, k.cover_public_id, k.cover_version, k.status,
         k.temporary_status, k.claimed, k.verified, k.created_at,
         k.avg_rating, k.review_count, k.is_open, k.distance_km,
         s.in_sections
  from public._place_cards(coalesce(v_ids, '{}'::uuid[]), coalesce(v_km, '{}'::double precision[])) k
  join unnest(coalesce(v_ids, '{}'::uuid[]), coalesce(v_in, '{}'::jsonb[])) as s(place_id, in_sections)
    on s.place_id = k.id
  order by k.list_position;
end;
$function$;

revoke all on function public.get_explore_place_sections(double precision, double precision, double precision, double precision, smallint, numeric, boolean, numeric, integer, integer, integer) from public;
grant execute on function public.get_explore_place_sections(double precision, double precision, double precision, double precision, smallint, numeric, boolean, numeric, integer, integer, integer) to anon, authenticated, service_role;

comment on function public.get_explore_place_sections(double precision, double precision, double precision, double precision, smallint, numeric, boolean, numeric, integer, integer, integer) is
  'The Explore rows of places for an area in one call: aroundYou, openNow and topRated, with the reader''s filters '
  'applied by the rule of get_filtered_places. One row per place; `sections` maps each row it belongs to onto its '
  'position there.';

do $$
declare
  v_fn text := 'public.get_explore_place_sections(double precision, double precision, double precision, double precision, smallint, numeric, boolean, numeric, integer, integer, integer)';
begin
  if to_regprocedure(v_fn) is null then
    raise exception 'migration check: % is missing', v_fn;
  end if;
  if not has_function_privilege('anon', v_fn, 'execute')
     or not has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception 'migration check: % cannot be called by the apps', v_fn;
  end if;
  -- It reads service-only tables (market, through hidden_listing_countries).
  if not (select p.prosecdef from pg_proc p where p.oid = to_regprocedure(v_fn)) then
    raise exception 'migration check: % must be SECURITY DEFINER', v_fn;
  end if;
  -- Answers with nothing to place it, rather than failing.
  perform * from public.get_explore_place_sections(null, null, null, null);
end
$$;
