-- Listing views by the Abonten link they came from, and a weekly note to
-- listers (docs/architecture/social-distribution.md).
--
-- Abonten now posts every new event and place on its own Instagram, X and
-- WhatsApp with a link tagged `?src=<code>` (@abonten/core/social/linkSources).
-- Listers keep listing when they can see that it brings people, so:
--
-- 1. event_analytics_event and place_analytics_event gain `source`: the
--    link's tag when the visitor followed one of Abonten's own links, else
--    null. The website and the app write it with the view; older app
--    builds keep writing without it.
-- 2. Every Monday at 09:00 UTC each account whose events or places were
--    viewed in the past seven days gets one notice: "Your listings had N
--    views this week", the most viewed listing, and how many came from
--    Abonten's own posts. In the app inbox and as a push (a team's Owners
--    get it through the existing fan-out); never an email. Listers can mute
--    its push like the other optional notices (`social`), so the category
--    rule gains the type, in step with @abonten/core/notifications/categories.
--
-- Nothing about a viewer is stored: the rows keep no account id, as before.

begin;

-- ---------------------------------------------------------------------------
-- 1. Where a view came from
-- ---------------------------------------------------------------------------

alter table public.event_analytics_event
  add column if not exists source text;
alter table public.event_analytics_event
  drop constraint if exists event_analytics_event_source_check;
alter table public.event_analytics_event
  add constraint event_analytics_event_source_check
  check (source is null or source in ('ig', 'x', 'wa', 'tt', 'fb'));
comment on column public.event_analytics_event.source is
  'The ?src= tag of an Abonten link the visitor followed (@abonten/core/social/linkSources), or null.';

alter table public.place_analytics_event
  add column if not exists source text;
alter table public.place_analytics_event
  drop constraint if exists place_analytics_event_source_check;
alter table public.place_analytics_event
  add constraint place_analytics_event_source_check
  check (source is null or source in ('ig', 'x', 'wa', 'tt', 'fb'));
comment on column public.place_analytics_event.source is
  'The ?src= tag of an Abonten link the visitor followed (@abonten/core/social/linkSources), or null.';

-- ---------------------------------------------------------------------------
-- 2. The weekly note is optional: its push follows the social switch
-- ---------------------------------------------------------------------------
-- The body is the live one (20260913090400_recommendations_engine) plus the
-- new type. Keep it identical to SOCIAL_TYPES in
-- packages/core/src/notifications/categories.ts.

create or replace function public._notification_optional_category(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type in ('message', 'review_received', 'review_reply', 'listing_views_weekly') then 'social'
    when p_type like 'place\_booking\_%' then 'social'
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The weekly note
-- ---------------------------------------------------------------------------

create table if not exists public.listing_views_weekly_run (
  week_start date primary key,
  notices    integer not null default 0,
  ran_at     timestamptz not null default now()
);

comment on table public.listing_views_weekly_run is
  'One row per week the listing-views note ran, so a retried run sends nothing twice. Service role only.';

alter table public.listing_views_weekly_run enable row level security;
revoke all on table public.listing_views_weekly_run from public, anon, authenticated;
grant all on table public.listing_views_weekly_run to service_role;

create or replace function public.listing_views_weekly_notices(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week  date := date_trunc('week', p_now at time zone 'UTC')::date;
  v_from  timestamptz := p_now - interval '7 days';
  v_count integer := 0;
begin
  -- Once a week: a second run in the same week (a retry) sends nothing.
  insert into public.listing_views_weekly_run (week_start)
  values (v_week)
  on conflict (week_start) do nothing;
  if not found then
    return 0;
  end if;

  with views as (
    select e.organizer_id as account_id,
           'event'::text  as kind,
           e.id           as listing_id,
           e.title        as title,
           count(*)::integer as views,
           (count(*) filter (where a.source is not null))::integer as social
      from public.event_analytics_event a
      join public.event e on e.id = a.event_id
     where a.event_type = 'view'
       and a.created_at >= v_from
       and a.created_at < p_now
     group by e.organizer_id, e.id, e.title
    union all
    select p.owner_id,
           'place'::text,
           p.id,
           p.name,
           count(*)::integer,
           (count(*) filter (where a.source is not null))::integer
      from public.place_analytics_event a
      join public.place p on p.id = a.place_id
     where a.event_type = 'view'
       and a.created_at >= v_from
       and a.created_at < p_now
       and p.owner_id is not null
     group by p.owner_id, p.id, p.name
  ), per_account as (
    select v.account_id,
           sum(v.views)::integer  as views,
           sum(v.social)::integer as social,
           (array_agg(v.kind       order by v.views desc, v.listing_id))[1] as top_kind,
           (array_agg(v.listing_id order by v.views desc, v.listing_id))[1] as top_id,
           (array_agg(v.title      order by v.views desc, v.listing_id))[1] as top_title
      from views v
     group by v.account_id
  ), recipients as (
    select pa.*
      from per_account pa
      join public.user_info u on u.id = pa.account_id and u.status_id = 1
     where pa.views > 0
  ), inserted as (
    insert into public.notification (user_id, type, title, body, link, data)
    select r.account_id,
           'listing_views_weekly',
           case when r.views = 1
                then 'Your listings had 1 view this week'
                else 'Your listings had ' || r.views || ' views this week' end,
           case when r.social > 0
                then 'Most viewed: ' || r.top_title || '. ' || r.social
                     || ' came from Abonten''s own posts.'
                else 'Most viewed: ' || r.top_title || '.' end,
           case when r.top_kind = 'event'
                then '/manage/events/' || r.top_id
                else '/manage/places/' || r.top_id end,
           jsonb_build_object(
             'kind', 'listing_views',
             'notice', jsonb_build_object(
               'id', 'listing_views_weekly',
               'params', jsonb_build_object(
                 'views', r.views,
                 'social', r.social,
                 'top', r.top_title
               )
             )
           )
      from recipients r
    returning id, user_id
  ), pushed as (
    -- A person's own phone; a team has none (its Owners get copies, pushed
    -- by trg_notification_fan_out_to_team).
    insert into public.notification_delivery (notification_id, user_id, channel, source, urgent)
    select i.id, i.user_id, 'push', 'app', false
      from inserted i
     where not exists (select 1 from public.team t where t.account_id = i.user_id)
    on conflict (notification_id, channel) do nothing
    returning 1
  )
  select count(*) into v_count from inserted;

  update public.listing_views_weekly_run
     set notices = v_count, ran_at = now()
   where week_start = v_week;
  return v_count;
end;
$$;

comment on function public.listing_views_weekly_notices(timestamptz) is
  'Monday note to every account whose events or places were viewed in the past seven days. Run by the listing-views-weekly job. Service role only.';

revoke all on function public.listing_views_weekly_notices(timestamptz) from public, anon, authenticated;
grant execute on function public.listing_views_weekly_notices(timestamptz) to service_role;

select cron.unschedule(j.jobname)
from cron.job j
where j.jobname = 'listing-views-weekly';

select cron.schedule('listing-views-weekly', '0 9 * * 1',
  $cron$select public.listing_views_weekly_notices();$cron$);

-- ---------------------------------------------------------------------------
-- 4. Checks
-- ---------------------------------------------------------------------------

do $check$
begin
  if has_function_privilege('authenticated', 'public.listing_views_weekly_notices(timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.listing_views_weekly_notices(timestamptz)', 'execute')
     or has_table_privilege('authenticated', 'public.listing_views_weekly_run', 'select') then
    raise exception 'migration check: the weekly views note is service role only';
  end if;
  if public._notification_optional_category('listing_views_weekly') is distinct from 'social'
     or public._notification_optional_category('review_received') is distinct from 'social'
     or public._notification_optional_category('place_booking_requested') is distinct from 'social'
     or public._notification_optional_category('ticket_purchase') is not null then
    raise exception 'migration check: the optional-category rule changed more than intended';
  end if;
  if not exists (select 1 from cron.job where jobname = 'listing-views-weekly' and active) then
    raise exception 'migration check: the listing-views-weekly job is not scheduled';
  end if;
end;
$check$;

commit;
