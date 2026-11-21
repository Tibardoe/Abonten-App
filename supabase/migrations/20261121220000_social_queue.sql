-- Admin › Social: the posting queue for Abonten's own channels
-- (docs/architecture/social-distribution.md, handbook docs/admin/social.md).
--
-- Abonten posts every new event and place on its own Instagram, X and
-- WhatsApp Channel, so listers have a reason to list. Instagram is posted by
-- hand by the founder (automated use locked the account on 2026-11-18); X and
-- the WhatsApp Channel by an operator reading the same queue. The queue only
-- says WHAT to post: the caption, the tagged link and the share-kit images
-- are computed when the queue is read (@abonten/services/admin/social), never
-- stored, so an edit to a listing shows in its caption at once.
--
--   social_queue_setting  one row: on/off, the accounts never posted (the App
--                         Review sample organizer), the daily cap on new
--                         listings, and the job's watermark
--   social_post           one row per subject per channel: an event, a place
--                         or a weekly roundup (key + the chosen events), with
--                         its status (pending, posted, skipped)
--
--   social_queue_listings()  every 15 minutes: newly published, public,
--                            upcoming events and newly published places
--                            -> ig_story, x, wa_channel
--   social_queue_roundup()   Monday and Friday 07:00 UTC: "What's on in Accra
--                            this week" / "This weekend in Accra", up to 10
--                            events on in the window within the Accra city
--                            radius -> ig_feed, x, wa_channel
--
-- Which events are on is the Explore rule (_explore_event_candidates), the
-- one rule every event list uses; a run of shows is posted once. Both tables
-- and both functions are service-role only: the admin console reads and
-- writes them with the service role after checking social.view /
-- social.manage. Nothing here posts anything.

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------

create table public.social_queue_setting (
  id                    smallint primary key default 1 check (id = 1),
  enabled               boolean not null default true,
  -- Accounts whose listings are never queued: the App Review demo organizer
  -- (its sample events are not real; apps/web/src/utils/searchIndexing.ts
  -- keeps them out of search engines for the same reason).
  excluded_account_ids  uuid[] not null default '{}',
  -- At most this many NEW listings (events and places together) are queued
  -- per day, in the default market's zone; the rest wait for the next day.
  -- Roundups do not count.
  daily_cap             smallint not null default 12
                          check (daily_cap between 0 and 200),
  -- The job has looked at every listing published up to this moment.
  queue_watermark       timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references public.user_info (id) on delete set null
);

-- Starts three days back, so the first posts are ready the day it ships.
insert into public.social_queue_setting (id, excluded_account_ids, queue_watermark)
values (1, array['22d25b53-4c08-4070-9097-1fac287351c8']::uuid[], now() - interval '3 days')
on conflict (id) do nothing;

create index idx_social_queue_setting_updated_by
  on public.social_queue_setting (updated_by) where updated_by is not null;

-- ---------------------------------------------------------------------------
-- 2. The queue
-- ---------------------------------------------------------------------------

create table public.social_post (
  id            uuid primary key default gen_random_uuid(),
  subject_kind  text not null check (subject_kind in ('event', 'place', 'roundup')),
  event_id      uuid references public.event (id) on delete cascade,
  place_id      uuid references public.place (id) on delete cascade,
  -- week:<Monday> or weekend:<Friday>, days of the default market.
  roundup_key   text check (roundup_key ~ '^(week|weekend):[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  -- A roundup's events, in the order they are listed.
  event_ids     uuid[] not null default '{}',
  channel       text not null check (channel in ('ig_story', 'ig_feed', 'x', 'wa_channel')),
  status        text not null default 'pending'
                  check (status in ('pending', 'posted', 'skipped')),
  -- The day it was queued, in the default market's zone.
  queued_on     date not null,
  created_at    timestamptz not null default now(),
  posted_at     timestamptz,
  posted_by     uuid references public.user_info (id) on delete set null,
  note          text check (note is null or char_length(note) <= 500),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.user_info (id) on delete set null,
  subject_key   text generated always as (
                  case subject_kind
                    when 'event' then 'event:' || event_id::text
                    when 'place' then 'place:' || place_id::text
                    else 'roundup:' || roundup_key
                  end) stored,
  constraint social_post_subject check (
    (subject_kind = 'event' and event_id is not null and place_id is null
       and roundup_key is null and cardinality(event_ids) = 0)
    or (subject_kind = 'place' and place_id is not null and event_id is null
       and roundup_key is null and cardinality(event_ids) = 0)
    or (subject_kind = 'roundup' and roundup_key is not null and event_id is null
       and place_id is null and cardinality(event_ids) between 1 and 10)
  ),
  constraint social_post_posted_time check ((status = 'posted') = (posted_at is not null)),
  -- Nothing is queued twice.
  constraint social_post_subject_channel_key unique (subject_key, channel)
);

create index idx_social_post_day on public.social_post (queued_on desc, status);
create index idx_social_post_pending on public.social_post (created_at) where status = 'pending';
create index idx_social_post_event on public.social_post (event_id) where event_id is not null;
create index idx_social_post_place on public.social_post (place_id) where place_id is not null;
create index idx_social_post_posted_by on public.social_post (posted_by) where posted_by is not null;
create index idx_social_post_updated_by on public.social_post (updated_by) where updated_by is not null;

-- ---------------------------------------------------------------------------
-- 3. Access: service role only
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['social_queue_setting', 'social_post'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Queueing new listings
-- ---------------------------------------------------------------------------

-- Every listing published since the watermark (and at least five minutes
-- ago, so a typo fixed straight after publishing is not posted) is looked at
-- once, oldest first:
--   * an event qualifies when the Explore rule has it on (published, not
--     archived or postponed, not hidden or removed, in a market that is
--     open, a date that has not ended), its next date has not started, its
--     moderation state is visible, its organizer is an active account that
--     is not excluded, and no other show of its run is queued already;
--   * a place qualifies when it is published, visible, not closed, in an
--     open market, and its owner is an active account that is not excluded.
-- A qualifying listing gets ig_story, x and wa_channel rows. When the day's
-- cap is reached the job stops before that listing and leaves the watermark
-- just before it, so it waits for the next day (an event that has started by
-- then is passed over).
create or replace function public.social_queue_listings(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s         public.social_queue_setting;
  v_now     timestamptz := now();
  v_limit   integer := least(greatest(coalesce(p_limit, 200), 1), 1000);
  v_tz      text;
  v_today   date;
  v_used    integer;
  v_queued  integer := 0;
  v_passed  integer := 0;
  v_capped  boolean := false;
  v_mark    timestamptz;
  v_rows    integer;
  c         record;
begin
  -- One run at a time (the job, or a run started by hand).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.social_queue_listings'));

  select * into s from public.social_queue_setting where id = 1;
  if not found or not s.enabled then
    return jsonb_build_object('skipped', 'disabled');
  end if;

  select m.default_timezone into v_tz from public.market m where m.is_default;
  if v_tz is null then
    return jsonb_build_object('skipped', 'no_default_market');
  end if;
  v_today := (v_now at time zone v_tz)::date;

  select count(distinct sp.subject_key)::integer into v_used
  from public.social_post sp
  where sp.queued_on = v_today and sp.subject_kind in ('event', 'place');

  v_mark := s.queue_watermark;

  for c in
    with fresh as materialized (
      select x.kind, x.id, x.published_at
      from (
        select 'event'::text as kind, e.id, e.published_at
        from public.event e
        where e.published_at > s.queue_watermark
          and e.published_at <= v_now - interval '5 minutes'
        union all
        select 'place'::text, p.id, p.published_at
        from public.place p
        where p.published_at > s.queue_watermark
          and p.published_at <= v_now - interval '5 minutes'
      ) x
      order by x.published_at, x.id
      limit v_limit
    ),
    -- The Explore rule, once for the whole batch (materialized: never once
    -- per row of the batch).
    on_events as materialized (
      select oe.id, oe.sort_start
      from public._explore_event_candidates(
        null, null, null,
        p_with_distance => false,
        p_only_ids => (select coalesce(array_agg(f.id), '{}'::uuid[])
                       from fresh f where f.kind = 'event')
      ) oe
    )
    select f.kind, f.id, f.published_at,
           case f.kind
             when 'event' then exists (
               select 1
               from on_events oe
               join public.event e on e.id = oe.id
               join public.user_info u on u.id = e.organizer_id
               where oe.id = f.id
                 and oe.sort_start > v_now
                 and coalesce(e.moderation_state, 'visible') = 'visible'
                 and e.organizer_id <> all (s.excluded_account_ids)
                 and u.status_id = 1
                 and (e.series_id is null or not exists (
                       select 1
                       from public.social_post sp
                       join public.event e2 on e2.id = sp.event_id
                       where e2.series_id = e.series_id and e2.id <> e.id)))
             else exists (
               select 1
               from public.place p
               join public.user_info u on u.id = p.owner_id
               where p.id = f.id
                 and p.status = 'published'
                 and coalesce(p.moderation_state, 'visible') = 'visible'
                 and p.temporary_status is null
                 and (p.country_code <> all ((select public.hidden_listing_countries())::text[]))
                 and p.owner_id <> all (s.excluded_account_ids)
                 and u.status_id = 1)
           end as eligible
    from fresh f
    order by f.published_at, f.id
  loop
    if c.eligible then
      if v_used >= s.daily_cap then
        v_capped := true;
        -- This listing (and every later one) waits for tomorrow.
        if v_mark >= c.published_at then
          v_mark := c.published_at - interval '1 microsecond';
        end if;
        exit;
      end if;
      insert into public.social_post (subject_kind, event_id, place_id, channel, queued_on)
      select c.kind,
             case when c.kind = 'event' then c.id end,
             case when c.kind = 'place' then c.id end,
             ch.channel,
             v_today
      from unnest(array['ig_story', 'x', 'wa_channel']) as ch(channel)
      on conflict do nothing;
      get diagnostics v_rows = row_count;
      if v_rows > 0 then
        v_used := v_used + 1;
        v_queued := v_queued + 1;
      end if;
    else
      v_passed := v_passed + 1;
    end if;
    v_mark := greatest(v_mark, c.published_at);
  end loop;

  if v_mark is distinct from s.queue_watermark then
    update public.social_queue_setting set queue_watermark = v_mark where id = 1;
  end if;

  return jsonb_build_object(
    'queued', v_queued,
    'passed', v_passed,
    'capped', v_capped,
    'usedToday', v_used,
    'dailyCap', s.daily_cap,
    'watermark', v_mark
  );
end;
$$;

comment on function public.social_queue_listings(integer) is
  'Admin › Social: queue newly published public events and places for Abonten''s own channels (ig_story, x, wa_channel). Job social-queue-listings, every 15 minutes. Service role only.';

-- ---------------------------------------------------------------------------
-- 5. Queueing the weekly roundups
-- ---------------------------------------------------------------------------

-- A roundup lists up to 10 events on in its window in Accra: the default
-- market's city with slug 'accra' (market_region, kept in step with
-- ROUNDUP_CITY in @abonten/core/social/roundups), within its radius of its
-- centre, because the post's words and link name Accra. Featured or
-- promoted events first, then by their date; no Accra row, no roundup
-- (skipped 'no_city'). The window is a
-- whole week (Monday to Sunday) or a weekend (Friday to Sunday) of the
-- market's calendar. Without p_kind the day decides (Monday: the week,
-- Friday: the weekend, other days: nothing); without p_start it is the
-- current week or weekend. Queued once per key (ig_feed, x, wa_channel);
-- a window with no events queues nothing.
create or replace function public.social_queue_roundup(
  p_kind  text default null,
  p_start date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s         public.social_queue_setting;
  v_now     timestamptz := now();
  v_market  public.market;
  v_city    public.market_region;
  v_local   date;
  v_kind    text := p_kind;
  v_start   date := p_start;
  v_from    timestamptz;
  v_to      timestamptz;
  v_key     text;
  v_ids     uuid[];
  v_rows    integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.social_queue_roundup'));

  select * into s from public.social_queue_setting where id = 1;
  if not found or not s.enabled then
    return jsonb_build_object('skipped', 'disabled');
  end if;

  select * into v_market from public.market m where m.is_default;
  if not found then
    return jsonb_build_object('skipped', 'no_default_market');
  end if;
  v_local := (v_now at time zone v_market.default_timezone)::date;

  select * into v_city
  from public.market_region r
  where r.country_code = v_market.country_code and r.slug = 'accra';
  if not found then
    return jsonb_build_object('skipped', 'no_city');
  end if;

  if v_kind is null then
    v_kind := case extract(isodow from v_local)::integer
                when 1 then 'week'
                when 5 then 'weekend'
              end;
    if v_kind is null then
      return jsonb_build_object('skipped', 'not_a_roundup_day');
    end if;
  end if;
  if v_kind not in ('week', 'weekend') then
    raise exception 'social_queue_roundup: unknown kind %', v_kind using errcode = '22023';
  end if;

  if v_start is null then
    v_start := case v_kind
                 -- This week's Monday.
                 when 'week' then v_local - (extract(isodow from v_local)::integer - 1)
                 -- This week's Friday: ahead from Monday to Thursday, back on
                 -- Saturday and Sunday.
                 else v_local + (5 - extract(isodow from v_local)::integer)
               end;
  end if;
  if extract(isodow from v_start)::integer <> (case when v_kind = 'week' then 1 else 5 end) then
    raise exception 'social_queue_roundup: a % starts on a %', v_kind,
      (case when v_kind = 'week' then 'Monday' else 'Friday' end)
      using errcode = '22023';
  end if;

  v_key := v_kind || ':' || to_char(v_start, 'YYYY-MM-DD');
  if exists (select 1 from public.social_post sp where sp.subject_key = 'roundup:' || v_key) then
    return jsonb_build_object('key', v_key, 'skipped', 'already_queued');
  end if;

  -- From the first day's midnight to the last day's end, on the market's clock.
  v_from := v_start::timestamp at time zone v_market.default_timezone;
  v_to := ((v_start + case v_kind when 'week' then 7 else 3 end)::timestamp
             at time zone v_market.default_timezone) - interval '1 microsecond';

  select coalesce(array_agg(x.id order by x.ord), '{}'::uuid[]) into v_ids
  from (
    select oe.id,
           row_number() over (
             order by (e.featured or exists (
                         select 1 from public.event_promotion ep
                         where ep.event_id = e.id
                           and ep.starts_at <= v_now and ep.ends_at > v_now)) desc,
                      oe.sort_start, oe.id) as ord
    -- The rule keeps events within the radius of the point whether or not
    -- it measures their distance.
    from public._explore_event_candidates(
      v_city.centre_lat, v_city.centre_lng, v_city.radius_km::double precision,
      p_start_date => v_from,
      p_end_date => v_to,
      p_with_distance => false
    ) oe
    join public.event e on e.id = oe.id
    join public.user_info u on u.id = e.organizer_id
    where e.country_code = v_market.country_code
      and coalesce(e.moderation_state, 'visible') = 'visible'
      and e.organizer_id <> all (s.excluded_account_ids)
      and u.status_id = 1
    order by 2
    limit 10
  ) x;

  if cardinality(v_ids) = 0 then
    return jsonb_build_object('key', v_key, 'skipped', 'no_events');
  end if;

  insert into public.social_post (subject_kind, roundup_key, event_ids, channel, queued_on)
  select 'roundup', v_key, v_ids, ch.channel, v_local
  from unnest(array['ig_feed', 'x', 'wa_channel']) as ch(channel)
  on conflict do nothing;
  get diagnostics v_rows = row_count;

  return jsonb_build_object('key', v_key, 'queued', v_rows, 'events', cardinality(v_ids));
end;
$$;

comment on function public.social_queue_roundup(text, date) is
  'Admin › Social: queue the weekly roundup ("What''s on in Accra this week" on Mondays, "This weekend in Accra" on Fridays) for ig_feed, x and wa_channel. Job social-queue-roundups. Service role only.';

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.social_queue_listings(integer)',
    'public.social_queue_roundup(text, date)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Jobs (UTC; Accra is UTC+0)
-- ---------------------------------------------------------------------------

select cron.schedule(
  'social-queue-listings',
  '*/15 * * * *',
  $$select public.social_queue_listings(200);$$
);

select cron.schedule(
  'social-queue-roundups',
  '0 7 * * 1,5',
  $$select public.social_queue_roundup();$$
);

-- ---------------------------------------------------------------------------
-- 7. Admin permissions (Admin › Social)
-- ---------------------------------------------------------------------------

insert into public.admin_permission (key, label, description) values
  ('social.view',   'View the social queue',
     'See the posting queue for Abonten''s own Instagram, X and WhatsApp Channel: pictures, captions and tagged links.'),
  ('social.manage', 'Work the social queue',
     'Mark queued posts as posted or skipped, and change the queue settings (on/off, daily cap, excluded accounts).')
on conflict (key) do nothing;

-- super_admin is granted everything in code (its rows are immutable).
insert into public.admin_role_permission (role_key, permission_key) values
  ('operations', 'social.view'),
  ('operations', 'social.manage'),
  ('moderator',  'social.view'),
  ('moderator',  'social.manage')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 8. Checks
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['social_queue_setting', 'social_post'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = format('public.%I', t)::regclass) then
      raise exception 'migration check: % has row level security off', t;
    end if;
    if has_table_privilege('anon', format('public.%I', t), 'select')
       or has_table_privilege('authenticated', format('public.%I', t), 'select')
       or has_table_privilege('authenticated', format('public.%I', t), 'insert')
       or has_table_privilege('authenticated', format('public.%I', t), 'update') then
      raise exception 'migration check: % is reachable from the apps', t;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.social_queue_listings(integer)', 'execute')
     or has_function_privilege('anon', 'public.social_queue_listings(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.social_queue_roundup(text, date)', 'execute')
     or has_function_privilege('anon', 'public.social_queue_roundup(text, date)', 'execute') then
    raise exception 'migration check: a social queue function is callable by the apps';
  end if;
  if not exists (select 1 from public.social_queue_setting where id = 1) then
    raise exception 'migration check: the social queue has no settings row';
  end if;
  if not exists (select 1 from cron.job where jobname = 'social-queue-listings' and active)
     or not exists (select 1 from cron.job where jobname = 'social-queue-roundups' and active) then
    raise exception 'migration check: the social queue jobs are not scheduled';
  end if;
  if (select count(*) from public.admin_permission where key in ('social.view', 'social.manage')) <> 2 then
    raise exception 'migration check: the social permissions are missing';
  end if;
end;
$$;
