-- Where "Explore what's happening elsewhere" points, per market
-- (PROJECT.md §55.1, docs/architecture/global-platform.md §1a).
--
-- When someone is in an area Abonten hasn't launched in, Explore offers
-- launched cities to browse instead. Until now that was always the single
-- geographically nearest launched city (from Kumasi: Cape Coast, 180 km,
-- before Accra, 200 km). Each market now chooses how, from Admin › Markets
-- › Cities and launch, without a deployment:
--
--   choose       show up to browse_fallback_limit launched cities, nearest
--                first, and let the person pick (default)
--   nearest      recommend the nearest launched city
--   most_active  recommend the launched city with the most upcoming events
--                plus published places inside its radius (ties: nearest;
--                all zero: nearest)
--   fixed        recommend browse_fallback_region_id
--
-- Every strategy only ever offers active, launched cities of a live market;
-- a fixed city that is later made coming soon, deactivated or deleted
-- falls back to the nearest (deleted: the reference is cleared).
--
--   market_region_activity(country)  upcoming events and places per city —
--                                    the "most active" measure, and the
--                                    counts Admin shows under each city
--   area_launch_overview             now reads its counts from it, so the
--                                    two can never disagree

-- ---------------------------------------------------------------------------
-- 1. Per-market browse fallback
-- ---------------------------------------------------------------------------

alter table public.market
  add column browse_fallback text not null default 'choose'
    check (browse_fallback in ('choose', 'nearest', 'most_active', 'fixed')),
  add column browse_fallback_region_id uuid
    references public.market_region (id) on delete set null,
  add column browse_fallback_limit smallint not null default 3
    check (browse_fallback_limit between 2 and 5);

comment on column public.market.browse_fallback is
  'How Explore suggests launched cities to someone in an area Abonten has not launched in: choose (a short list, nearest first), nearest, most_active (most upcoming events + places), fixed (browse_fallback_region_id). Only active launched cities of a live market are ever offered.';
comment on column public.market.browse_fallback_region_id is
  'The city recommended when browse_fallback = fixed. Ignored (nearest is used) while it is not an active, launched city of this market.';
comment on column public.market.browse_fallback_limit is
  'How many cities the choose strategy lists (2-5).';

-- ---------------------------------------------------------------------------
-- 2. Activity per city
-- ---------------------------------------------------------------------------

-- Upcoming published events and published places inside each city's radius,
-- with the visibility rules discovery uses (not archived, not hidden or
-- removed). With a country: every city of that market (Admin). Without: the
-- candidates Explore may suggest — active, launched cities of live markets.
create or replace function public.market_region_activity(p_country_code text default null)
returns table (
  region_id       uuid,
  upcoming_events bigint,
  places          bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    (select count(*)
       from public.event e
      where e.status = 'published'
        and e.archived_at is null
        and e.moderation_state is distinct from 'hidden'
        and e.moderation_state is distinct from 'removed'
        and (coalesce(e.ends_at, e.starts_at) > now()
             or exists (select 1 from public.event_occurrence o
                         where o.event_id = e.id and o.ends_at > now()))
        and extensions.st_dwithin(
              e.location,
              extensions.st_makepoint(r.centre_lng, r.centre_lat)::extensions.geography,
              r.radius_km * 1000)),
    (select count(*)
       from public.place p
      where p.status = 'published'
        and p.moderation_state is distinct from 'hidden'
        and p.moderation_state is distinct from 'removed'
        and extensions.st_dwithin(
              p.location,
              extensions.st_makepoint(r.centre_lng, r.centre_lat)::extensions.geography,
              r.radius_km * 1000))
  from public.market_region r
  join public.market m on m.country_code = r.country_code
  where case
          when p_country_code is null then
            m.status = 'live' and r.status = 'active' and r.launch_status = 'launched'
          else r.country_code = upper(p_country_code)
        end;
$$;

-- Replace only the definition 20260930100000 created.
do $$
begin
  if md5(pg_get_functiondef('public.area_launch_overview(text)'::regprocedure))
     <> '496d2edfb56daa704491050727e14aa2' then
    raise exception 'area_launch_overview changed since 20260930100000; re-derive this change';
  end if;
end;
$$;

create or replace function public.area_launch_overview(p_country_code text)
returns table (
  region_id       uuid,
  waiting         bigint,
  upcoming_events bigint,
  places          bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    (select count(distinct w.user_id)
       from public.area_waitlist w
      where w.region_id = r.id
         or (w.region_id is null
             and w.country_code = r.country_code
             and public._area_distance_km(w.lat, w.lng, r.centre_lat, r.centre_lng) <= r.radius_km)),
    a.upcoming_events,
    a.places
  from public.market_region r
  join public.market_region_activity(p_country_code) a on a.region_id = r.id
  where r.country_code = upper(p_country_code);
$$;

revoke all on function public.market_region_activity(text) from public, anon, authenticated;
grant execute on function public.market_region_activity(text) to service_role;
