-- Launched areas and the "tell me when it launches" waiting list
-- (PROJECT.md §55, docs/architecture/global-platform.md §1a).
--
-- A market is live or it is not (market_transition). Inside a live market
-- supply grows city by city, so someone in Kumasi who sees an Abonten advert
-- and opens the app before anything is listed there should be told so
-- honestly, shown the nearest city that is open, and offered a notice when
-- theirs opens. Nothing is blocked: search, shared links, tickets and
-- creating listings keep working everywhere in a live market.
--
--   market_region.launch_status  launched | coming_soon
--   market.coverage_mode         what a point outside every listed city is:
--                                everywhere (open) | launched_areas (not yet)
--   area_waitlist                who asked to be told, for which area (~1 km)
--   area_waitlist_notify()       in-app notice + queued push per person when
--                                a city is launched; their rows are deleted
--   area_launch_overview()       per city: people waiting, upcoming events,
--                                published places (Admin › Markets)
--   area_waitlist_outside()      people waiting outside every listed city
--
-- The defaults change nothing: every existing city is launched and every
-- market is `everywhere` until staff switch them in Admin › Markets.

-- ---------------------------------------------------------------------------
-- 1. Launch state
-- ---------------------------------------------------------------------------

alter table public.market
  add column coverage_mode text not null default 'everywhere'
    check (coverage_mode in ('everywhere', 'launched_areas'));
comment on column public.market.coverage_mode is
  'What a point outside every listed city (market_region) is: everywhere = open, launched_areas = not launched yet (Explore says so and offers the waiting list). Launched cities are open in both modes.';

alter table public.market_region
  add column launch_status text not null default 'launched'
    check (launch_status in ('launched', 'coming_soon')),
  add column launched_at timestamptz;
comment on column public.market_region.launch_status is
  'launched: Abonten is open here. coming_soon: Explore says Abonten is not here yet, offers the nearest launched city and the waiting list. Listings, search and checkout are never blocked either way.';
comment on column public.market_region.launched_at is
  'When staff last launched this city (null for cities launched before 2026-09-30).';

-- ---------------------------------------------------------------------------
-- 2. The waiting list
-- ---------------------------------------------------------------------------

create table public.area_waitlist (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.user_info (id) on delete cascade,
  -- The country the point is in; not a foreign key, so demand from a
  -- country with no market row yet is still recorded.
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  -- The listed city the point was in when the person joined, if any.
  region_id    uuid references public.market_region (id) on delete set null,
  -- One row per person per area: 'region:<id>' or 'point:<lat>,<lng>'
  -- (two decimals, ~1 km).
  area_key     text not null check (length(area_key) between 3 and 80),
  label        text not null check (length(label) between 1 and 80),
  -- Rounded to two decimals by the service (~1 km): enough to find the city
  -- that later covers it, never a precise position.
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  source       text not null check (source in ('web', 'app')),
  created_at   timestamptz not null default now(),
  unique (user_id, area_key)
);
comment on table public.area_waitlist is
  'People who asked to be told when Abonten launches in their area. Written only by @abonten/services/markets/areaWaitlistCore (service role); rows are deleted when the notice goes out (area_waitlist_notify), when the person leaves the list, or when the account is deleted.';

create index area_waitlist_region_idx
  on public.area_waitlist (region_id) where region_id is not null;
create index area_waitlist_unplaced_idx
  on public.area_waitlist (country_code) where region_id is null;

alter table public.area_waitlist enable row level security;
revoke all on table public.area_waitlist from anon, authenticated;
grant select, insert, update, delete on table public.area_waitlist to service_role;

-- ---------------------------------------------------------------------------
-- 3. Functions (service role only)
-- ---------------------------------------------------------------------------

-- Great-circle distance in km; the same formula as distanceMetres in
-- @abonten/core/fieldOps/territory, so the service and SQL agree on who is
-- inside a city.
create or replace function public._area_distance_km(
  p_lat1 double precision,
  p_lng1 double precision,
  p_lat2 double precision,
  p_lng2 double precision
)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 2 * 6371.0088 * asin(least(1.0, sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2))
      * power(sin(radians(p_lng2 - p_lng1) / 2), 2))));
$$;

-- Tells everyone waiting in a launched city that it is open: one in-app
-- notice each (kind 'area', opening that city on web and app) and a push
-- through the delivery queue (source 'app', daytime only), then deletes
-- their rows. The delete is the claim, so two staff launching at once can't
-- notify anyone twice. Returns how many people were told.
create or replace function public.area_waitlist_notify(p_region_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_region public.market_region;
  v_count  integer := 0;
begin
  select * into v_region from public.market_region where id = p_region_id;
  if not found then
    raise exception 'area_waitlist_notify: unknown region %', p_region_id;
  end if;
  if v_region.status <> 'active' or v_region.launch_status <> 'launched' then
    raise exception 'area_waitlist_notify: region % is not launched', v_region.slug;
  end if;

  with taken as (
    delete from public.area_waitlist w
    where w.region_id = v_region.id
       or (w.region_id is null
           and w.country_code = v_region.country_code
           and public._area_distance_km(w.lat, w.lng, v_region.centre_lat, v_region.centre_lng)
               <= v_region.radius_km)
    returning w.user_id
  ), people as (
    select distinct t.user_id
    from taken t
    join public.user_info u on u.id = t.user_id
    where u.status_id is distinct from 4
  ), notices as (
    insert into public.notification (user_id, type, title, body, link, data)
    select p.user_id,
           'area_launched',
           'Abonten is now in ' || v_region.name,
           'Events and places in ' || v_region.name || ' are on Abonten. Take a look.',
           '/explore/' || v_region.slug
             || '?lat=' || v_region.centre_lat::text
             || '&lng=' || v_region.centre_lng::text,
           jsonb_build_object(
             'kind', 'area',
             'regionId', v_region.id,
             'regionSlug', v_region.slug,
             'areaLabel', v_region.name,
             'lat', v_region.centre_lat,
             'lng', v_region.centre_lng,
             'radiusKm', v_region.radius_km)
    from people p
    returning id, user_id
  ), queued as (
    insert into public.notification_delivery (notification_id, user_id, channel, source, urgent)
    select n.id, n.user_id, 'push', 'app', false
    from notices n
    on conflict (notification_id, channel) do nothing
    returning 1
  )
  select count(*) into v_count from notices;

  return v_count;
end;
$$;

-- Per listed city of a market: distinct people waiting (joined inside it,
-- or joined outside every city at a point it now covers), upcoming
-- published events and published places within its radius. The same
-- visibility rules discovery uses (published, not hidden or removed).
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
  where r.country_code = upper(p_country_code);
$$;

-- People waiting outside every active listed city of a market, grouped by
-- the name of the area they asked from: where to consider opening next.
create or replace function public.area_waitlist_outside(
  p_country_code text,
  p_limit        integer default 20
)
returns table (
  label   text,
  waiting bigint,
  lat     double precision,
  lng     double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.label, count(distinct w.user_id), avg(w.lat), avg(w.lng)
  from public.area_waitlist w
  where w.country_code = upper(p_country_code)
    and w.region_id is null
    and not exists (
      select 1 from public.market_region r
      where r.country_code = w.country_code
        and r.status = 'active'
        and public._area_distance_km(w.lat, w.lng, r.centre_lat, r.centre_lng) <= r.radius_km)
  group by w.label
  order by 2 desc, 1
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public._area_distance_km(double precision, double precision, double precision, double precision)',
    'public.area_waitlist_notify(uuid)',
    'public.area_launch_overview(text)',
    'public.area_waitlist_outside(text, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Account deletion clears the person's waiting rows
-- ---------------------------------------------------------------------------
-- Accounts are anonymised, never deleted, so the user_info foreign key never
-- cascades. The body below is the 20260915100200 definition with one line
-- added (area_waitlist); replace only the definition it was written against.

do $$
begin
  if md5(pg_get_functiondef('public.anonymize_deleted_account(uuid)'::regprocedure))
     <> 'd74293f4d9fd3eb4f688ab5fac6e66d3' then
    raise exception 'anonymize_deleted_account changed since 20260915100200; re-derive this change';
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.anonymize_deleted_account(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_suffix          text := replace(left(p_user_id::text, 13), '-', '');
  r                 record;
  v_events_cancelled integer := 0;
  v_events_archived  integer := 0;
  v_drafts_deleted   integer := 0;
  v_places_unclaimed integer := 0;
  v_claims_deleted   integer := 0;
  v_cases_closed     integer := 0;
begin
  if not exists (select 1 from public.user_info where id = p_user_id) then
    raise exception 'anonymize_deleted_account: unknown user %', p_user_id;
  end if;

  for r in
    select id, status from public.verification_case
    where requester_id = p_user_id
      and status in ('draft', 'pending_review', 'needs_info', 'approved')
  loop
    begin
      perform public.verification_transition(
        r.id, null, 'system',
        case when r.status = 'approved' then 'revoke' else 'withdraw' end,
        'account_deleted', null);
      v_cases_closed := v_cases_closed + 1;
    exception when others then
      null;
    end;
  end loop;

  insert into public.storage_purge_queue (bucket_id, object_path, reason)
  select 'place-claim-documents', d.storage_path, 'account_deleted'
  from public.place_claim_document d
  join public.place_claim_request cr on cr.id = d.claim_request_id
  where cr.claimant_id = p_user_id and cr.status = 'pending'
  on conflict (bucket_id, object_path) where status in ('queued', 'sending') do nothing;

  delete from public.place_claim_request
  where claimant_id = p_user_id and status = 'pending';
  get diagnostics v_claims_deleted = row_count;

  delete from public.event
  where organizer_id = p_user_id and status = 'draft';
  get diagnostics v_drafts_deleted = row_count;

  update public.event e
     set status = 'canceled'
   where e.organizer_id = p_user_id
     and e.status = 'published'
     and coalesce((select max(o.ends_at) from public.event_occurrence o where o.event_id = e.id), e.ends_at) > now()
     and not exists (
       select 1
       from public.ticket t
       join public.ticket_type tt on tt.id = t.ticket_type_id
       where tt.event_id = e.id and t.status in ('active', 'used'));
  get diagnostics v_events_cancelled = row_count;

  update public.event e
     set archived_at = coalesce(e.archived_at, now())
   where e.organizer_id = p_user_id
     and e.archived_at is null;
  get diagnostics v_events_archived = row_count;

  update public.place
     set claimed = false,
         verified = false,
         verified_at = null,
         verification_case_id = null,
         updated_at = now()
   where owner_id = p_user_id
     and (claimed or verified or verification_case_id is not null);
  get diagnostics v_places_unclaimed = row_count;

  delete from public.device_token where user_id = p_user_id;
  delete from public.web_push_subscription where user_id = p_user_id;
  delete from public.favorite where user_id = p_user_id;
  delete from public.favorite_place where user_id = p_user_id;
  delete from public.event_reminder where user_id = p_user_id;
  delete from public.notification where user_id = p_user_id;
  delete from public.notification_preference where user_id = p_user_id;
  delete from public.notification_subscription where user_id = p_user_id;
  delete from public.area_waitlist where user_id = p_user_id;
  delete from public.user_image_history where user_id = p_user_id;
  delete from public.receiving_account where user_id = p_user_id;
  delete from public.highlight where user_id = p_user_id;
  delete from public.drafts where user_id = p_user_id;

  update public.payment_method
     set status = 'removed',
         is_default = false,
         details = jsonb_strip_nulls(jsonb_build_object(
           'scrubbed', true,
           'brand',   details ->> 'brand',
           'last4',   details ->> 'last4',
           'network', details ->> 'network',
           'bank',    details ->> 'bank')),
         updated_at = now()
   where user_id = p_user_id;

  update public.payout_account
     set status = 'removed',
         is_default = false,
         account_holder_name = 'Deleted user',
         account_number = 'removed',
         updated_at = now()
   where organizer_id = p_user_id;

  update public.user_info
     set full_name = 'Deleted user',
         username = ('deleted_' || v_suffix)::extensions.citext,
         username_is_generated = true,
         avatar_public_id = null,
         avatar_version = null,
         bio = null,
         website = null,
         organizer_verified = false,
         organizer_verified_at = null,
         organizer_verification_case_id = null,
         status_id = 4,
         updated_at = now()
   where id = p_user_id;

  return jsonb_build_object(
    'events_cancelled', v_events_cancelled,
    'events_archived',  v_events_archived,
    'drafts_deleted',   v_drafts_deleted,
    'places_unclaimed', v_places_unclaimed,
    'claims_deleted',   v_claims_deleted,
    'cases_closed',     v_cases_closed
  );
end;
$function$;
