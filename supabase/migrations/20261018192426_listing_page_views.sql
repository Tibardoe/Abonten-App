-- Page views of events and places, from the website and the app (2026-10-18).
--
-- Until now only place pages counted views, and only on the website
-- (place_analytics_event, written by the web PlaceViewLogger). Event pages
-- counted nothing, and the app sent only Featured-banner impressions. Once
-- people have the app, a tapped abontenhub.com link opens the app, so
-- website-only counts would undercount more every week.
--
-- 1. event_analytics_event: the event twin of place_analytics_event. One row
--    per page opened, with the platform and the server's time; no account
--    id, no device id, no address. Inserts come from anyone (signed out
--    visitors count too); only the event's organizer reads them, and the
--    admin console through the service role.
-- 2. place_analytics_event gains the same platform column.
-- 3. Both throttles drop the listing owner's own views and clicks (an
--    organizer checking their page is not an audience) and keep the existing
--    bound of 60 rows per listing per type per minute.
-- 4. admin_listing_views(): totals and the most viewed events and places in
--    a period, for Admin › Analytics. Service role only.

-- 1 ─────────────────────────────────────────────────────────────────────────

create table public.event_analytics_event (
  id uuid not null default extensions.uuid_generate_v4(),
  event_id uuid not null,
  event_type text not null default 'view',
  platform text,
  created_at timestamp with time zone not null default now(),
  constraint event_analytics_event_pkey primary key (id),
  constraint event_analytics_event_event_id_fkey foreign key (event_id)
    references public.event (id) on delete cascade,
  constraint event_analytics_event_type_check check (event_type = 'view'),
  constraint event_analytics_event_platform_check
    check (platform is null or platform in ('web', 'ios', 'android'))
);

create index event_analytics_event_event_idx
  on public.event_analytics_event (event_id, event_type, created_at);
create index event_analytics_event_created_idx
  on public.event_analytics_event (created_at);

alter table public.event_analytics_event enable row level security;

revoke all on table public.event_analytics_event from public, anon, authenticated;
grant insert on table public.event_analytics_event to anon, authenticated;
grant select on table public.event_analytics_event to authenticated;
grant all on table public.event_analytics_event to service_role;

create policy event_analytics_event_public_insert
  on public.event_analytics_event
  for insert to anon, authenticated
  with check (event_type = 'view');

create policy event_analytics_event_organizer_select
  on public.event_analytics_event
  for select to authenticated
  using (
    exists (
      select 1
      from public.event e
      where e.id = event_analytics_event.event_id
        and e.organizer_id = (select auth.uid())
    )
  );

-- 2 ─────────────────────────────────────────────────────────────────────────

alter table public.place_analytics_event
  add column platform text,
  add constraint place_analytics_event_platform_check
    check (platform is null or platform in ('web', 'ios', 'android'));

-- 3 ─────────────────────────────────────────────────────────────────────────

-- SECURITY DEFINER so the count sees every row and the owner lookup sees a
-- draft; the caller is read from the request's JWT, not current_user.
create or replace function public.throttle_event_analytics_event()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_organizer uuid;
begin
  if coalesce(auth.role(), 'service_role') not in ('authenticated', 'anon') then
    return new;
  end if;
  new.created_at := now();

  select e.organizer_id into v_organizer
  from public.event e
  where e.id = new.event_id;
  if v_organizer is not null and v_organizer = auth.uid() then
    return null;
  end if;

  if (
    select count(*)
    from public.event_analytics_event a
    where a.event_id = new.event_id
      and a.event_type = new.event_type
      and a.created_at > now() - interval '1 minute'
  ) >= 60 then
    return null;
  end if;
  return new;
end;
$function$;

revoke execute on function public.throttle_event_analytics_event()
  from public, anon, authenticated;

create trigger event_analytics_event_throttle
  before insert on public.event_analytics_event
  for each row execute function public.throttle_event_analytics_event();

create or replace function public.throttle_place_analytics_event()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_owner uuid;
begin
  if coalesce(auth.role(), 'service_role') not in ('authenticated', 'anon') then
    return new;
  end if;
  new.created_at := now();

  select p.owner_id into v_owner
  from public.place p
  where p.id = new.place_id;
  if v_owner is not null and v_owner = auth.uid() then
    return null;
  end if;

  if public.place_analytics_recent_count(new.place_id, new.event_type) >= 60 then
    return null;
  end if;
  return new;
end;
$function$;

revoke execute on function public.throttle_place_analytics_event()
  from public, anon, authenticated;

-- 4 ─────────────────────────────────────────────────────────────────────────

create or replace function public.admin_listing_views(
  p_from timestamp with time zone,
  p_to timestamp with time zone,
  p_limit integer default 10
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with ev as (
    select a.event_id,
           count(*)::integer as views,
           (count(*) filter (where a.platform in ('ios', 'android')))::integer as app_views
    from public.event_analytics_event a
    where a.event_type = 'view'
      and a.created_at >= p_from
      and a.created_at < p_to
    group by a.event_id
  ),
  pl as (
    select a.place_id,
           count(*)::integer as views,
           (count(*) filter (where a.platform in ('ios', 'android')))::integer as app_views
    from public.place_analytics_event a
    where a.event_type = 'view'
      and a.created_at >= p_from
      and a.created_at < p_to
    group by a.place_id
  ),
  top_ev as (
    select * from ev order by views desc, event_id limit greatest(p_limit, 1)
  ),
  top_pl as (
    select * from pl order by views desc, place_id limit greatest(p_limit, 1)
  )
  select jsonb_build_object(
    'eventViews', coalesce((select sum(views) from ev), 0),
    'eventAppViews', coalesce((select sum(app_views) from ev), 0),
    'placeViews', coalesce((select sum(views) from pl), 0),
    'placeAppViews', coalesce((select sum(app_views) from pl), 0),
    'topEvents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id,
               'title', e.title,
               'eventCode', e.event_code,
               'views', t.views,
               'appViews', t.app_views
             ) order by t.views desc, e.title)
      from top_ev t
      join public.event e on e.id = t.event_id
    ), '[]'::jsonb),
    'topPlaces', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'name', p.name,
               'slug', p.slug,
               'views', t.views,
               'appViews', t.app_views
             ) order by t.views desc, p.name)
      from top_pl t
      join public.place p on p.id = t.place_id
    ), '[]'::jsonb)
  );
$function$;

revoke all on function public.admin_listing_views(timestamp with time zone, timestamp with time zone, integer)
  from public, anon, authenticated;
grant execute on function public.admin_listing_views(timestamp with time zone, timestamp with time zone, integer)
  to service_role;
