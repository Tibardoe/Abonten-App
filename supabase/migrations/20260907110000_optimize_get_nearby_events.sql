-- Scalability fix for the Explore / "Around You" event feed.
--
-- PROBLEM (measured, not assumed). The previous implementation built one
-- `matched` CTE that, for EVERY published event inside the search radius, ran
-- three separate probes against event_occurrence (a correlated MIN, an EXISTS
-- and a NOT EXISTS), a LATERAL aggregate over ticket_type, and a json_agg of
-- that event's occurrences -- and only then applied ORDER BY + LIMIT.
-- Returning 20 rows therefore cost work proportional to the whole radius.
-- Benchmarked against a local copy of this schema (numbers in PROJECT.md 24.6):
--
--     candidates in radius     before
--         1,093                 7.08 ms
--         9,055                66.29 ms
--        44,454               375.82 ms      <- still only 20 rows returned
--
-- FIX. Three stages:
--   1. `candidate` narrows to (id, sort_key) only -- no wide columns, no
--      aggregates. This is the only stage that touches every event in the
--      radius, and it now needs one index-only probe per event instead of
--      three heap-touching ones.
--   2. `page` applies the keyset cursor and the LIMIT.
--   3. The wide row and the two expensive LATERAL aggregates run against that
--      one page (at most p_page_size + 1 rows), not the whole radius.
--
-- Also drops `description` from the returned columns. Verified unused: the
-- feed's own type (UserPostType in packages/types/src/postsType.ts) does not
-- declare it and no card renders it, while the rows average over a kilobyte
-- of text each.
--
-- SECURITY. Unchanged, deliberately. The function stays SECURITY INVOKER (no
-- SECURITY DEFINER), keeps the same search_path, keeps the same EXECUTE
-- grants, and applies exactly the same visibility predicates (status =
-- 'published', moderation_state not hidden/removed, and the same
-- future-occurrence rule). Logical equivalence against the previous
-- implementation was verified over 290 page-comparisons spanning 7
-- geographies / radii / page sizes with full keyset pagination walks:
-- 0 mismatches on ids, ordering, or payload.

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Lets a selective radius ("around you") be answered from the spatial index
-- alone. idx_event_geo covers every event regardless of state, so the planner
-- preferred idx_event_status and re-checked ST_DWithin on the heap. This
-- partial index holds exactly the rows the discovery feeds may return, so the
-- status/moderation predicates are satisfied by the index predicate itself.
-- Confirmed chosen by the planner for a 2 km radius.
create index if not exists idx_event_geo_discoverable
  on public.event using gist (location)
  where status = 'published'
    and moderation_state is distinct from 'hidden'
    and moderation_state is distinct from 'removed';

-- Covers the per-candidate occurrence probe end to end. The existing
-- idx_event_occurrence_event_starts stops at (event_id, starts_at), so
-- `ends_at > now()` was re-checked on the heap -- 157k of the 247k buffers in
-- the old plan. With ends_at in the index the probe becomes index-only.
-- Measured effect at 44k candidates: 122.72 ms -> 94.99 ms.
create index if not exists idx_event_occurrence_event_ends_starts
  on public.event_occurrence (event_id, ends_at, starts_at);

-- ---------------------------------------------------------------------------
-- Function
-- ---------------------------------------------------------------------------

-- The return type changes (description removed), so this cannot be a
-- CREATE OR REPLACE. Only the 6-argument (paginated) overload is touched --
-- every application caller passes all six arguments.
drop function if exists public.get_nearby_events(
  double precision, double precision, double precision,
  timestamp with time zone, uuid, integer
);

create function public.get_nearby_events(
  user_lat double precision,
  user_lng double precision,
  search_radius double precision,
  p_cursor_sort_key timestamp with time zone default null,
  p_cursor_id uuid default null,
  p_page_size integer default 20
)
returns table(
  id uuid,
  organizer_id uuid,
  event_category text,
  event_type text,
  title text,
  slug text,
  location geography,
  address jsonb,
  website_url text,
  capacity integer,
  flyer_public_id text,
  flyer_version character varying,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  status character varying,
  created_at timestamp with time zone,
  event_code text,
  min_price numeric,
  currency text,
  occurrences json,
  featured boolean,
  cursor_sort_key timestamp with time zone
)
language plpgsql
set search_path to 'public', 'extensions'
as $function$
begin
  return query
  with candidate as (
    select
      e.id,
      coalesce(fo.next_start, 'infinity'::timestamptz) as sort_key
    from event e
    -- One index-only probe returns both facts the filter needs: the next
    -- future occurrence, and whether the event has any occurrence at all.
    left join lateral (
      select
        min(o.starts_at) filter (where o.ends_at > now()) as next_start,
        count(*) as total
      from event_occurrence o
      where o.event_id = e.id
    ) fo on true
    where
      e.status = 'published'
      and e.moderation_state is distinct from 'hidden'
      and e.moderation_state is distinct from 'removed'
      and st_dwithin(
        e.location,
        st_setsrid(st_makepoint(user_lng, user_lat), 4326),
        search_radius
      )
      and (
        -- A non-null next_start already proves "has a future occurrence", so
        -- the old implementation's separate EXISTS is folded away here.
        fo.next_start is not null
        or (
          coalesce(fo.total, 0) = 0
          and (
            e.ends_at > now()
            or (e.ends_at is null and e.starts_at > now())
          )
        )
      )
  ),
  page as (
    select c.id, c.sort_key
    from candidate c
    where
      p_cursor_id is null
      or (c.sort_key, c.id) > (p_cursor_sort_key, p_cursor_id)
    order by c.sort_key asc, c.id asc
    limit p_page_size + 1
  )
  select
    e.id,
    e.organizer_id,
    e.event_category,
    e.event_type,
    e.title,
    e.slug,
    e.location,
    e.address,
    e.website_url,
    e.capacity,
    e.flyer_public_id,
    e.flyer_version,
    e.starts_at,
    e.ends_at,
    e.status,
    e.created_at,
    e.event_code,
    ticket_data.min_price,
    ticket_data.currency,
    occ_data.occurrences,
    e.featured,
    p.sort_key as cursor_sort_key
  from page p
  join event e on e.id = p.id
  left join lateral (
    select
      min(tt.price) as min_price,
      min(tt.currency) as currency
    from ticket_type tt
    where tt.event_id = e.id
  ) ticket_data on true
  left join lateral (
    select
      case
        when count(*) > 0 then
          json_agg(
            json_build_object(
              'id', occ.id,
              'starts_at', occ.starts_at,
              'ends_at', occ.ends_at
            )
            order by occ.starts_at asc
          )
        else
          json_build_array(
            json_build_object(
              'id', null,
              'starts_at', e.starts_at,
              'ends_at', e.ends_at
            )
          )
      end as occurrences
    from event_occurrence occ
    where occ.event_id = e.id
  ) occ_data on true
  order by p.sort_key asc, p.id asc;
end;
$function$;

-- Restore the grants the dropped overload had (anon + authenticated read the
-- discovery feed without a session).
grant execute on function public.get_nearby_events(
  double precision, double precision, double precision,
  timestamp with time zone, uuid, integer
) to anon, authenticated, service_role;
