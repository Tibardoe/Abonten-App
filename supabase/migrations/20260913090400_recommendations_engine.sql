-- Discovery: recommendation engine (opt-in, capped, shadow-first).
--
-- Flow:
--   event/place published (published_at, set once by trigger)
--     -> recommendations_generate()   pg_cron every 15 min; watermark on
--                                     published_at; writes one
--                                     `recommendation` row per (person,
--                                     subject) for people who subscribed to
--                                     the organizer, the place, or similar
--                                     events/places nearby; suppresses what
--                                     the person already bought, saved,
--                                     reminded, owns or has visited
--     -> recommendations_build_digest() pg_cron hourly; acts at the
--                                     configured Accra hour; at most one
--                                     digest per person per day, weekly cap,
--                                     per-organizer cooldown, auto-pause
--                                     after unopened digests; one
--                                     `notification` + one push
--                                     `notification_delivery` (source
--                                     'recommendations', never urgent)
--     -> existing delivery queue (08:00-20:59 Accra push window, retries)
--     -> delivery outcome trigger marks rows notified / returns them
--
-- Shadow mode (discovery_program_setting.recommendations_shadow_mode, ships
-- ON): everything above runs, including caps, but rows are is_shadow = true
-- and no notification is written. The admin console reads the projections.
--
-- Adds: event.published_at, place.published_at (+ trigger, backfill),
-- recommendation, recommendation_digest, recommendation_digest_skip,
-- helper and job functions, notification_delivery source
-- 'recommendations', claim-time opt-out checks (recommendations and the
-- social push category), crons recommendations-generate,
-- recommendations-digest, recommendations-purge.
--
-- Access: all new tables RLS on with no anon/authenticated privileges;
-- functions service_role only (cron runs as the owner).

-- ---------------------------------------------------------------------
-- 1. published_at on events and places
-- ---------------------------------------------------------------------
alter table public.event add column if not exists published_at timestamptz;
alter table public.place add column if not exists published_at timestamptz;

update public.event set published_at = created_at
where status = 'published' and published_at is null;
update public.place set published_at = created_at
where status = 'published' and published_at is null;

create index if not exists idx_event_published_at on public.event (published_at)
  where published_at is not null;
create index if not exists idx_place_published_at on public.place (published_at)
  where published_at is not null;

create or replace function public._set_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and new.published_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_event_set_published_at on public.event;
create trigger trg_event_set_published_at
  before insert or update of status on public.event
  for each row execute function public._set_published_at();

drop trigger if exists trg_place_set_published_at on public.place;
create trigger trg_place_set_published_at
  before insert or update of status on public.place
  for each row execute function public._set_published_at();

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------
create table public.recommendation (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.user_info (id) on delete cascade,
  subject_type    text        not null check (subject_type in ('event', 'place')),
  subject_id      uuid        not null,
  reason_kind     text        not null
                    check (reason_kind in ('organizer', 'place', 'similar_events', 'similar_places')),
  subscription_id uuid        references public.notification_subscription (id) on delete set null,
  basis           jsonb       not null default '{}'::jsonb,
  score           numeric     not null,
  is_shadow       boolean     not null,
  status          text        not null default 'candidate'
                    check (status in ('candidate', 'shadow', 'batched', 'notified', 'suppressed',
                                      'expired', 'dismissed', 'clicked')),
  suppress_reason text,
  digest_id       uuid,
  notified_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint recommendation_user_subject_key unique (user_id, subject_type, subject_id)
);

comment on table public.recommendation is
  'One recommendation decision per person and subject: why (reason_kind, basis), how strong (score), and what happened (status). Shadow rows are projections only.';

create index idx_recommendation_open
  on public.recommendation (user_id, created_at)
  where status in ('candidate', 'shadow') and digest_id is null;
create index idx_recommendation_user_status on public.recommendation (user_id, status, created_at desc);
create index idx_recommendation_subject on public.recommendation (subject_type, subject_id);
create index idx_recommendation_digest on public.recommendation (digest_id) where digest_id is not null;
create index idx_recommendation_subscription on public.recommendation (subscription_id)
  where subscription_id is not null;
create index idx_recommendation_created on public.recommendation using brin (created_at);

create table public.recommendation_digest (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.user_info (id) on delete cascade,
  digest_date      date        not null,
  is_shadow        boolean     not null,
  item_count       smallint    not null check (item_count > 0),
  top_subject_type text        not null check (top_subject_type in ('event', 'place')),
  top_subject_id   uuid        not null,
  organizer_ids    uuid[]      not null default '{}',
  categories       text[]      not null default '{}',
  notification_id  uuid        references public.notification (id) on delete set null,
  delivery_status  text        not null default 'pending'
                     check (delivery_status in ('shadow', 'pending', 'sent', 'skipped', 'failed')),
  opened_at        timestamptz,
  created_at       timestamptz not null default now(),
  constraint recommendation_digest_user_day_key unique (user_id, digest_date, is_shadow)
);

comment on table public.recommendation_digest is
  'At most one recommendation push per person per day (plus a shadow twin). Caps, cooldowns and open rates are computed from these rows.';

create index idx_recommendation_digest_user_created
  on public.recommendation_digest (user_id, created_at desc);
create index idx_recommendation_digest_notification
  on public.recommendation_digest (notification_id) where notification_id is not null;
create index idx_recommendation_digest_date on public.recommendation_digest (digest_date);

create table public.recommendation_digest_skip (
  id              bigint      generated always as identity primary key,
  user_id         uuid        not null references public.user_info (id) on delete cascade,
  digest_date     date        not null,
  is_shadow       boolean     not null,
  reason          text        not null
                    check (reason in ('daily_cap', 'weekly_cap', 'paused', 'ignored', 'opted_out', 'cooldown', 'no_items')),
  candidate_count integer     not null default 0,
  created_at      timestamptz not null default now()
);

create index idx_recommendation_digest_skip_date on public.recommendation_digest_skip (digest_date, reason);
create index idx_recommendation_digest_skip_user on public.recommendation_digest_skip (user_id);

do $$
declare
  t text;
begin
  foreach t in array array['recommendation', 'recommendation_digest', 'recommendation_digest_skip'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------
create or replace function public.discovery_audience_includes(
  p_audience text,
  p_beta     uuid[],
  p_user     uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_user is null then false
    when p_audience = 'all' then true
    when p_audience = 'beta' and p_user = any (coalesce(p_beta, '{}')) then true
    else exists (select 1 from public.admin_user a where a.user_id = p_user and a.status = 'active')
  end;
$$;

-- Why a subject should not be recommended to a person right now (null = fine).
create or replace function public._recommendation_suppression(
  p_user         uuid,
  p_subject_type text,
  p_subject_id   uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  e     record;
  p     record;
begin
  if not exists (select 1 from public.user_info u where u.id = p_user and u.status_id = 1) then
    return 'inactive_user';
  end if;

  if p_subject_type = 'event' then
    select ev.id, ev.organizer_id, ev.status, ev.archived_at, ev.moderation_state, ev.starts_at, ev.ends_at
      into e
    from public.event ev where ev.id = p_subject_id;
    if not found
       or e.status <> 'published' or e.archived_at is not null
       or e.moderation_state is not distinct from 'hidden'
       or e.moderation_state is not distinct from 'removed' then
      return 'not_visible';
    end if;
    if not (
      exists (select 1 from public.event_occurrence o where o.event_id = e.id and o.ends_at > v_now)
      or (not exists (select 1 from public.event_occurrence o where o.event_id = e.id)
          and (e.ends_at > v_now or (e.ends_at is null and e.starts_at > v_now)))
    ) then
      return 'ended';
    end if;
    if e.organizer_id = p_user then
      return 'own_subject';
    end if;
    if exists (select 1 from public.attendance a
               where a.event_id = e.id and a.user_id = p_user and a.status = 'attending') then
      return 'attending';
    end if;
    if exists (select 1 from public.favorite f
               where f.user_id = p_user and f.event_id = e.id and f.deleted_at is null) then
      return 'saved';
    end if;
    if exists (select 1 from public.event_reminder r where r.user_id = p_user and r.event_id = e.id) then
      return 'reminded';
    end if;
    return null;
  end if;

  select pl.id, pl.owner_id, pl.status, pl.moderation_state, pl.temporary_status
    into p
  from public.place pl where pl.id = p_subject_id;
  if not found
     or p.status <> 'published'
     or p.moderation_state is not distinct from 'hidden'
     or p.moderation_state is not distinct from 'removed'
     or p.temporary_status is not distinct from 'permanently_closed' then
    return 'not_visible';
  end if;
  if p.owner_id = p_user then
    return 'own_subject';
  end if;
  if exists (select 1 from public.favorite_place f where f.user_id = p_user and f.place_id = p.id) then
    return 'saved';
  end if;
  if exists (select 1 from public.place_visit v where v.user_id = p_user and v.place_id = p.id) then
    return 'visited';
  end if;
  return null;
end;
$$;

-- Push preference for one reason, for a person with or without a preference row.
create or replace function public._recommendation_reason_allowed(p_user uuid, p_reason text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p_reason
      when 'organizer' then np.organizer_alerts_push
      when 'place' then np.place_updates_push
      else np.recommendations_push
    end
    from public.notification_preference np
    where np.user_id = p_user
  ), true);
$$;

-- ---------------------------------------------------------------------
-- 4. Candidate generation
-- ---------------------------------------------------------------------
create or replace function public.recommendations_generate(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s            public.discovery_program_setting;
  v_now        timestamptz := now();
  v_limit      integer := least(greatest(coalesce(p_limit, 200), 1), 1000);
  v_subjects   integer := 0;
  v_rows       integer := 0;
  v_inserted   integer := 0;
  v_last       timestamptz;
  subj         record;
begin
  select * into s from public.discovery_program_setting where id = 1;
  if not found or not s.recommendations_enabled then
    return jsonb_build_object('skipped', 'disabled');
  end if;

  for subj in
    select * from (
      select 'event'::text as subject_type, ev.id, ev.published_at
      from public.event ev
      where ev.published_at > s.generate_watermark
        and ev.published_at <= v_now - interval '5 minutes'
      union all
      select 'place'::text, pl.id, pl.published_at
      from public.place pl
      where pl.published_at > s.generate_watermark
        and pl.published_at <= v_now - interval '5 minutes'
    ) x
    order by x.published_at, x.id
    limit v_limit
  loop
    v_subjects := v_subjects + 1;
    v_last := subj.published_at;

    if subj.subject_type = 'event' then
      insert into public.recommendation (
        user_id, subject_type, subject_id, reason_kind, subscription_id, basis, score,
        is_shadow, status, suppress_reason
      )
      select c.user_id, 'event', ev.id, c.reason_kind, c.subscription_id, c.basis, c.score,
             c.is_shadow,
             case when c.suppress is not null then 'suppressed'
                  when c.is_shadow then 'shadow'
                  else 'candidate' end,
             c.suppress
      from public.event ev
      cross join lateral (
        select coalesce(
          (select min(o.starts_at) from public.event_occurrence o
           where o.event_id = ev.id and o.ends_at > v_now),
          ev.starts_at) as next_start
      ) ns
      cross join lateral (
        select exp(greatest(-50.0,
          -0.693147 * greatest(0, extract(epoch from (ns.next_start - v_now)) / 3600.0) / 168.0)) as time_score
      ) ts
      cross join lateral (
        select
          m.user_id, m.reason_kind, m.subscription_id, m.basis,
          round(m.score::numeric, 6) as score,
          (s.recommendations_shadow_mode
            or not public.discovery_audience_includes(s.recommendations_audience, s.beta_user_ids, m.user_id)) as is_shadow,
          public._recommendation_suppression(m.user_id, 'event', ev.id) as suppress
        from (
          select distinct on (cand.user_id) cand.*
          from (
            select ns2.user_id, 'organizer'::text as reason_kind, ns2.id as subscription_id,
                   jsonb_build_object('organizerId', ev.organizer_id) as basis,
                   1.0 * ts.time_score as score, 1 as prio
            from public.notification_subscription ns2
            where ns2.kind = 'organizer' and ns2.status = 'active' and ns2.target_id = ev.organizer_id
            union all
            select ns2.user_id, 'place', ns2.id,
                   jsonb_build_object('placeId', ev.place_id),
                   0.9 * ts.time_score, 2
            from public.notification_subscription ns2
            where ev.place_id is not null
              and ns2.kind = 'place' and ns2.status = 'active' and ns2.target_id = ev.place_id
            union all
            select ns2.user_id, 'similar_events', ns2.id,
                   jsonb_build_object(
                     'category', ev.event_category,
                     'distanceKm', round((extensions.st_distance(ns2.topic_location, ev.location) / 1000)::numeric, 1)),
                   0.6 * ts.time_score
                     * exp(greatest(-50.0, -0.693147 * (extensions.st_distance(ns2.topic_location, ev.location) / 1000)
                                   / greatest(ns2.topic_radius_km::double precision / 2, 0.5))),
                   3
            from public.notification_subscription ns2
            where ns2.kind = 'similar_events' and ns2.status = 'active'
              and lower(ns2.topic_category) = lower(ev.event_category)
              and extensions.st_dwithin(ns2.topic_location, ev.location, (ns2.topic_radius_km * 1000)::double precision)
              and ns.next_start <= v_now + interval '60 days'
          ) cand
          order by cand.user_id, cand.prio, cand.score desc
        ) m
      ) c
      where ev.id = subj.id
      on conflict (user_id, subject_type, subject_id) do nothing;
    else
      insert into public.recommendation (
        user_id, subject_type, subject_id, reason_kind, subscription_id, basis, score,
        is_shadow, status, suppress_reason
      )
      select m.user_id, 'place', pl.id, 'similar_places', m.id, m.basis, m.score,
             m.is_shadow,
             case when m.suppress is not null then 'suppressed'
                  when m.is_shadow then 'shadow'
                  else 'candidate' end,
             m.suppress
      from public.place pl
      join public.place_category pc on pc.id = pl.category_id
      cross join lateral (
        select ns2.user_id, ns2.id,
               jsonb_build_object(
                 'category', pc.slug,
                 'distanceKm', round((extensions.st_distance(ns2.topic_location, pl.location) / 1000)::numeric, 1)) as basis,
               round((0.5 * exp(greatest(-50.0, -0.693147 * (extensions.st_distance(ns2.topic_location, pl.location) / 1000)
                               / greatest(ns2.topic_radius_km::double precision / 2, 0.5))))::numeric, 6) as score,
               (s.recommendations_shadow_mode
                 or not public.discovery_audience_includes(s.recommendations_audience, s.beta_user_ids, ns2.user_id)) as is_shadow,
               public._recommendation_suppression(ns2.user_id, 'place', pl.id) as suppress
        from public.notification_subscription ns2
        where ns2.kind = 'similar_places' and ns2.status = 'active'
          and lower(ns2.topic_category) = lower(pc.slug)
          and pl.location is not null
          and extensions.st_dwithin(ns2.topic_location, pl.location, (ns2.topic_radius_km * 1000)::double precision)
      ) m
      where pl.id = subj.id
      on conflict (user_id, subject_type, subject_id) do nothing;
    end if;

    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;
  end loop;

  if v_last is not null then
    -- A full batch may stop in the middle of a run of equal timestamps: step
    -- back a microsecond so the rest are picked up (inserts are idempotent).
    update public.discovery_program_setting
    set generate_watermark = case when v_subjects >= v_limit then v_last - interval '1 microsecond' else v_last end
    where id = 1;
  end if;

  return jsonb_build_object('subjects', v_subjects, 'inserted', v_inserted, 'watermark', v_last);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Daily digest
-- ---------------------------------------------------------------------
create or replace function public.recommendations_build_digest(
  p_limit integer default 5000,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s            public.discovery_program_setting;
  v_now        timestamptz := now();
  v_today      date := (now() at time zone 'Africa/Accra')::date;
  v_hour       integer := extract(hour from (now() at time zone 'Africa/Accra'))::integer;
  v_limit      integer := least(greatest(coalesce(p_limit, 5000), 1), 50000);
  v_users      integer := 0;
  v_live       integer := 0;
  v_shadow     integer := 0;
  v_skipped    integer := 0;
  grp          record;
  v_count      integer;
  v_items      record;
  v_digest_id  uuid;
  v_notif_id   uuid;
  v_title      text;
  v_body       text;
  v_link       text;
  v_data       jsonb;
  v_image_id   text;
  v_image_ver  text;
  v_top        record;
  v_recent     integer;
  v_unopened   integer;
  v_ids        uuid[];
begin
  select * into s from public.discovery_program_setting where id = 1;
  if not found or not s.recommendations_enabled then
    return jsonb_build_object('skipped', 'disabled');
  end if;
  if not p_force and v_hour <> s.digest_hour_local then
    return jsonb_build_object('skipped', 'not_digest_hour', 'hour', v_hour);
  end if;

  -- Housekeeping that makes the candidate set honest.
  update public.notification_subscription
  set status = 'active', updated_at = v_now
  where status = 'paused' and updated_at < v_now - interval '30 days';

  update public.recommendation r
  set status = 'expired', suppress_reason = 'ttl', updated_at = v_now
  where r.status in ('candidate', 'shadow') and r.digest_id is null
    and r.created_at <= v_now - make_interval(days => s.candidate_ttl_days);

  update public.recommendation r
  set status = 'suppressed', suppress_reason = 'unsubscribed', updated_at = v_now
  where r.status in ('candidate', 'shadow') and r.digest_id is null
    and r.subscription_id is not null
    and not exists (select 1 from public.notification_subscription ns
                    where ns.id = r.subscription_id and ns.status = 'active');

  update public.recommendation r
  set status = 'suppressed', suppress_reason = x.reason, updated_at = v_now
  from (
    select r2.id, public._recommendation_suppression(r2.user_id, r2.subject_type, r2.subject_id) as reason
    from public.recommendation r2
    where r2.status in ('candidate', 'shadow') and r2.digest_id is null
  ) x
  where r.id = x.id and x.reason is not null;

  for grp in
    select r.user_id, r.is_shadow, count(*) as n
    from public.recommendation r
    where r.status in ('candidate', 'shadow') and r.digest_id is null
    group by r.user_id, r.is_shadow
    order by r.user_id, r.is_shadow
    limit v_limit
  loop
    v_users := v_users + 1;

    if exists (select 1 from public.recommendation_digest d
               where d.user_id = grp.user_id and d.digest_date = v_today and d.is_shadow = grp.is_shadow) then
      continue;
    end if;

    if s.daily_push_cap = 0 then
      insert into public.recommendation_digest_skip (user_id, digest_date, is_shadow, reason, candidate_count)
      values (grp.user_id, v_today, grp.is_shadow, 'daily_cap', grp.n);
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if exists (select 1 from public.notification_preference np
               where np.user_id = grp.user_id and np.paused_until > v_now) then
      insert into public.recommendation_digest_skip (user_id, digest_date, is_shadow, reason, candidate_count)
      values (grp.user_id, v_today, grp.is_shadow, 'paused', grp.n);
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select count(*) into v_recent
    from public.recommendation_digest d
    where d.user_id = grp.user_id and d.is_shadow = grp.is_shadow
      and d.digest_date > v_today - 7
      and d.delivery_status in ('shadow', 'pending', 'sent');
    if v_recent >= s.weekly_push_cap then
      insert into public.recommendation_digest_skip (user_id, digest_date, is_shadow, reason, candidate_count)
      values (grp.user_id, v_today, grp.is_shadow, 'weekly_cap', grp.n);
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Several delivered digests in a row nobody opened: pause, don't nag.
    if not grp.is_shadow then
      select count(*) filter (where d.opened_at is null), count(*)
        into v_unopened, v_count
      from (
        select d2.opened_at
        from public.recommendation_digest d2
        where d2.user_id = grp.user_id and not d2.is_shadow and d2.delivery_status = 'sent'
        order by d2.created_at desc
        limit s.ignore_pause_after
      ) d;
      if v_count >= s.ignore_pause_after and v_unopened = v_count then
        insert into public.notification_preference (user_id, paused_until, updated_at)
        values (grp.user_id, v_now + make_interval(days => s.ignore_pause_days), v_now)
        on conflict (user_id) do update
          set paused_until = excluded.paused_until, updated_at = excluded.updated_at;
        insert into public.recommendation_digest_skip (user_id, digest_date, is_shadow, reason, candidate_count)
        values (grp.user_id, v_today, grp.is_shadow, 'ignored', grp.n);
        v_skipped := v_skipped + 1;
        continue;
      end if;
    end if;

    -- Opted-out reasons are closed for good (shadow rows keep them, so the
    -- projection shows what an opt-out removed).
    if not grp.is_shadow then
      update public.recommendation r
      set status = 'suppressed', suppress_reason = 'opted_out', updated_at = v_now
      where r.user_id = grp.user_id and r.status = 'candidate' and r.digest_id is null
        and not public._recommendation_reason_allowed(r.user_id, r.reason_kind);
    end if;

    -- Pick up to five: highest score first, soonest first; hold back a second
    -- event from an organizer already in a recent digest unless it is soon.
    select
      array_agg(t.id order by t.score desc, t.sort_start nulls last) as ids,
      count(*) as n,
      array_remove(array_agg(distinct t.organizer_id), null) as organizers,
      array_remove(array_agg(distinct t.category), null) as categories
    into v_items
    from (
      select r.id, r.score, r.subject_type, r.subject_id,
             ev.organizer_id,
             coalesce(ev.event_category, pc.name) as category,
             coalesce((select min(o.starts_at) from public.event_occurrence o
                       where o.event_id = ev.id and o.ends_at > v_now), ev.starts_at) as sort_start
      from public.recommendation r
      left join public.event ev on r.subject_type = 'event' and ev.id = r.subject_id
      left join public.place pl on r.subject_type = 'place' and pl.id = r.subject_id
      left join public.place_category pc on pc.id = pl.category_id
      where r.user_id = grp.user_id
        and r.is_shadow = grp.is_shadow
        and r.status in ('candidate', 'shadow')
        and r.digest_id is null
        and not (
          r.reason_kind = 'organizer'
          and s.organizer_cooldown_hours > 0
          and ev.organizer_id is not null
          and coalesce((select min(o.starts_at) from public.event_occurrence o
                        where o.event_id = ev.id and o.ends_at > v_now), ev.starts_at)
              > v_now + interval '48 hours'
          and exists (
            select 1 from public.recommendation_digest d
            where d.user_id = grp.user_id and d.is_shadow = grp.is_shadow
              and ev.organizer_id = any (d.organizer_ids)
              and d.created_at > v_now - make_interval(hours => s.organizer_cooldown_hours)
          )
        )
      order by r.score desc, sort_start nulls last
      limit 5
    ) t;

    if coalesce(v_items.n, 0) = 0 then
      insert into public.recommendation_digest_skip (user_id, digest_date, is_shadow, reason, candidate_count)
      values (grp.user_id, v_today, grp.is_shadow,
              case
                when not exists (select 1 from public.recommendation r
                                 where r.user_id = grp.user_id and r.is_shadow = grp.is_shadow
                                   and r.status in ('candidate', 'shadow') and r.digest_id is null)
                  then 'opted_out'
                else 'cooldown'
              end, grp.n);
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_ids := v_items.ids;

    select r.id, r.subject_type, r.subject_id, r.reason_kind,
           ev.title, ev.event_code, ev.flyer_public_id, ev.flyer_version, ev.organizer_id,
           coalesce((select min(o.starts_at) from public.event_occurrence o
                     where o.event_id = ev.id and o.ends_at > v_now), ev.starts_at) as next_start,
           org.username::text as organizer_username,
           pl.name as place_name, pl.slug as place_slug, pl.cover_public_id, pl.cover_version,
           pc.name as place_category,
           evpl.name as event_place_name
      into v_top
    from public.recommendation r
    left join public.event ev on r.subject_type = 'event' and ev.id = r.subject_id
    left join public.user_info org on org.id = ev.organizer_id
    left join public.place evpl on evpl.id = ev.place_id
    left join public.place pl on r.subject_type = 'place' and pl.id = r.subject_id
    left join public.place_category pc on pc.id = pl.category_id
    where r.id = v_ids[1];

    insert into public.recommendation_digest (
      user_id, digest_date, is_shadow, item_count, top_subject_type, top_subject_id,
      organizer_ids, categories, delivery_status
    ) values (
      grp.user_id, v_today, grp.is_shadow, v_items.n, v_top.subject_type, v_top.subject_id,
      coalesce(v_items.organizers, '{}'), coalesce(v_items.categories, '{}'),
      case when grp.is_shadow then 'shadow' else 'pending' end
    )
    returning id into v_digest_id;

    if grp.is_shadow then
      update public.recommendation r
      set digest_id = v_digest_id, updated_at = v_now
      where r.id = any (v_ids);
      v_shadow := v_shadow + 1;
      continue;
    end if;

    if v_top.subject_type = 'event' then
      v_body := v_top.title || ' · '
        || trim(to_char(v_top.next_start at time zone 'Africa/Accra', 'Dy DD Mon, FMHH12:MIam'));
      v_image_id := v_top.flyer_public_id;
      v_image_ver := v_top.flyer_version;
      if v_items.n = 1 then
        v_title := case v_top.reason_kind
          when 'organizer' then 'New event from @' || coalesce(v_top.organizer_username, 'an organizer you follow')
          when 'place' then 'New event at ' || coalesce(v_top.event_place_name, 'a place you follow')
          else 'An event you might like'
        end;
        v_link := '/events/' || lower(v_top.event_code);
      end if;
    else
      v_body := v_top.place_name || coalesce(' · ' || v_top.place_category, '');
      v_image_id := v_top.cover_public_id;
      v_image_ver := v_top.cover_version;
      if v_items.n = 1 then
        v_title := 'A place you might like';
        v_link := '/places/' || v_top.place_slug;
      end if;
    end if;

    if v_items.n > 1 then
      v_title := v_items.n || ' picks for you';
      v_body := v_body || ' and ' || (v_items.n - 1) || ' more';
      v_link := '/for-you';
    end if;

    v_data := jsonb_strip_nulls(jsonb_build_object(
      'kind', 'recommendation',
      'digestId', v_digest_id,
      'eventId', case when v_items.n = 1 and v_top.subject_type = 'event' then v_top.subject_id end,
      'placeId', case when v_items.n = 1 and v_top.subject_type = 'place' then v_top.subject_id end,
      'placeSlug', case when v_items.n = 1 and v_top.subject_type = 'place' then v_top.place_slug end
    ));

    insert into public.notification (user_id, type, title, body, link, data, image_public_id, image_version)
    values (grp.user_id, 'recommendation_digest', left(v_title, 120), left(v_body, 240), v_link, v_data,
            v_image_id, v_image_ver)
    returning id into v_notif_id;

    insert into public.notification_delivery (notification_id, user_id, channel, source, urgent)
    values (v_notif_id, grp.user_id, 'push', 'recommendations', false)
    on conflict (notification_id, channel) do nothing;

    update public.recommendation_digest set notification_id = v_notif_id where id = v_digest_id;

    update public.recommendation r
    set digest_id = v_digest_id, status = 'batched', updated_at = v_now
    where r.id = any (v_ids);

    update public.notification_subscription ns
    set last_notified_at = v_now
    where ns.id in (select r.subscription_id from public.recommendation r
                    where r.id = any (v_ids) and r.subscription_id is not null);

    v_live := v_live + 1;
  end loop;

  return jsonb_build_object('users', v_users, 'live', v_live, 'shadow', v_shadow, 'skipped', v_skipped,
                            'date', v_today);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Delivery integration
-- ---------------------------------------------------------------------
alter table public.notification_delivery drop constraint if exists notification_delivery_source_check;
alter table public.notification_delivery
  add constraint notification_delivery_source_check
  check (source in ('rewards', 'app', 'recommendations'));
alter table public.notification_delivery drop constraint if exists notification_delivery_recommendations_not_urgent;
alter table public.notification_delivery
  add constraint notification_delivery_recommendations_not_urgent
  check (source <> 'recommendations' or not urgent);

-- Optional push categories for notices written with source 'app'.
-- Transactional types return null and are never skipped.
create or replace function public._notification_optional_category(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type in ('message', 'review_received', 'review_reply') then 'social'
    when p_type like 'place\_booking\_%' then 'social'
    else null
  end;
$$;

create or replace function public.notification_delivery_claim(p_limit integer default 200)
returns table (
  delivery_id     bigint,
  notification_id uuid,
  user_id         uuid,
  channel         text,
  source          text,
  type            text,
  title           text,
  body            text,
  link            text,
  data            jsonb,
  created_at      timestamptz
)
language sql
security definer
set search_path = ''
as $$
  -- The program switches cover reward notices only.
  update public.notification_delivery d
  set status = 'skipped', detail = 'channel_off', finished_at = now()
  from public.reward_program_setting s
  where s.id = 1
    and d.status = 'queued'
    and d.source = 'rewards'
    and ((d.channel = 'push' and not s.notify_push_enabled)
      or (d.channel = 'email' and not s.notify_email_enabled));

  update public.notification_delivery d
  set status = 'skipped', detail = 'opted_out', finished_at = now()
  where d.status = 'queued'
    and d.channel = 'email'
    and d.source = 'rewards'
    and exists (
      select 1 from public.notification_preference p
      where p.user_id = d.user_id and not p.reward_emails
    );

  -- Recommendations: the programme can be switched off or back into shadow
  -- after a digest was queued.
  update public.notification_delivery d
  set status = 'skipped', detail = 'channel_off', finished_at = now()
  from public.discovery_program_setting s
  where s.id = 1
    and d.status = 'queued'
    and d.source = 'recommendations'
    and (not s.recommendations_enabled or s.recommendations_shadow_mode);

  -- ...and the person can pause or opt out after it was queued.
  update public.notification_delivery d
  set status = 'skipped', detail = 'opted_out', finished_at = now()
  where d.status = 'queued'
    and d.source = 'recommendations'
    and (
      exists (select 1 from public.notification_preference p
              where p.user_id = d.user_id and p.paused_until > now())
      or not exists (
        select 1 from public.recommendation r
        join public.recommendation_digest g on g.id = r.digest_id
        where g.notification_id = d.notification_id
          and public._recommendation_reason_allowed(r.user_id, r.reason_kind)
          and (r.subscription_id is null or exists (
                select 1 from public.notification_subscription ns
                where ns.id = r.subscription_id and ns.status = 'active'))
      )
    );

  -- Social pushes (messages, reviews, booking updates) respect social_push.
  update public.notification_delivery d
  set status = 'skipped', detail = 'opted_out', finished_at = now()
  from public.notification n
  where d.status = 'queued'
    and d.channel = 'push'
    and d.source = 'app'
    and n.id = d.notification_id
    and public._notification_optional_category(n.type) = 'social'
    and exists (select 1 from public.notification_preference p
                where p.user_id = d.user_id and not p.social_push);

  with due as (
    select d.id
    from public.notification_delivery d
    where d.id in (select public._notification_delivery_due(least(greatest(p_limit, 1), 500)))
    for update skip locked
  ), claimed as (
    update public.notification_delivery d
    set status = 'sending', attempts = d.attempts + 1, claimed_at = now()
    from due
    where d.id = due.id
    returning d.id, d.notification_id, d.user_id, d.channel, d.source
  )
  select c.id, c.notification_id, c.user_id, c.channel, c.source,
         n.type, n.title, n.body, n.link, n.data, n.created_at
  from claimed c
  join public.notification n on n.id = c.notification_id
  order by c.id;
$$;

create or replace function public._recommendation_delivery_outcome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_digest uuid;
begin
  select g.id into v_digest
  from public.recommendation_digest g
  where g.notification_id = new.notification_id;
  if v_digest is null then
    return new;
  end if;

  if new.status = 'sent' then
    update public.recommendation_digest set delivery_status = 'sent' where id = v_digest;
    update public.recommendation
    set status = 'notified', notified_at = now(), updated_at = now()
    where digest_id = v_digest and status = 'batched';
  else
    -- Skipped or failed: nothing reached the phone. The rows may go out in a
    -- later digest while they are still fresh.
    update public.recommendation_digest set delivery_status = new.status where id = v_digest;
    update public.recommendation
    set status = 'candidate', digest_id = null, updated_at = now()
    where digest_id = v_digest and status = 'batched';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recommendation_delivery_outcome on public.notification_delivery;
create trigger trg_recommendation_delivery_outcome
  after update of status on public.notification_delivery
  for each row
  when (new.source = 'recommendations'
        and new.status in ('sent', 'skipped', 'failed')
        and old.status is distinct from new.status)
  execute function public._recommendation_delivery_outcome();

-- ---------------------------------------------------------------------
-- 7. Feedback, For-you list, retention, metrics
-- ---------------------------------------------------------------------

-- A tap on a recommendation notice (or on a For-you card).
create or replace function public.recommendation_mark_opened(
  p_user            uuid,
  p_notification_id uuid,
  p_subject_type    text default null,
  p_subject_id      uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_digest uuid;
  v_rows   integer := 0;
begin
  if p_notification_id is not null then
    update public.recommendation_digest g
    set opened_at = coalesce(g.opened_at, now())
    where g.notification_id = p_notification_id and g.user_id = p_user
    returning g.id into v_digest;
  end if;

  if p_subject_id is not null and p_subject_type in ('event', 'place') then
    update public.recommendation r
    set status = 'clicked', updated_at = now()
    where r.user_id = p_user and r.subject_type = p_subject_type and r.subject_id = p_subject_id
      and not r.is_shadow and r.status in ('candidate', 'batched', 'notified');
    get diagnostics v_rows = row_count;
  elsif v_digest is not null then
    update public.recommendation r
    set status = 'clicked', updated_at = now()
    where r.digest_id = v_digest and r.user_id = p_user and r.status = 'notified'
      and r.id = (select r2.id from public.recommendation r2
                  where r2.digest_id = v_digest order by r2.score desc limit 1);
    get diagnostics v_rows = row_count;
  end if;

  return v_digest is not null or v_rows > 0;
end;
$$;

-- "Not interested". Three in 30 days from the same subscription pause it.
create or replace function public.recommendation_dismiss(
  p_user         uuid,
  p_subject_type text,
  p_subject_id   uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub     uuid;
  v_count   integer := 0;
  v_paused  boolean := false;
begin
  update public.recommendation r
  set status = 'dismissed', updated_at = now()
  where r.user_id = p_user and r.subject_type = p_subject_type and r.subject_id = p_subject_id
    and not r.is_shadow and r.status in ('candidate', 'batched', 'notified', 'clicked')
  returning r.subscription_id into v_sub;

  if not found then
    return jsonb_build_object('dismissed', false, 'paused', false);
  end if;

  if v_sub is not null then
    select count(*) into v_count
    from public.recommendation r
    where r.user_id = p_user and r.subscription_id = v_sub and r.status = 'dismissed'
      and r.updated_at > now() - interval '30 days';
    if v_count >= 3 then
      update public.notification_subscription
      set status = 'paused', updated_at = now()
      where id = v_sub and user_id = p_user and status = 'active';
      v_paused := found;
    end if;
  end if;

  return jsonb_build_object('dismissed', true, 'paused', v_paused);
end;
$$;

-- The For-you list: live (never shadow) picks from the last 30 days whose
-- subject is still visible and not already acted on.
create or replace function public.recommendations_for_user(
  p_user  uuid,
  p_limit integer default 30
)
returns table (
  recommendation_id uuid,
  subject_type      text,
  subject_id        uuid,
  reason_kind       text,
  basis             jsonb,
  score             numeric,
  status            text,
  created_at        timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.subject_type, r.subject_id, r.reason_kind, r.basis, r.score, r.status, r.created_at
  from public.recommendation r
  where r.user_id = p_user
    and not r.is_shadow
    and r.status in ('candidate', 'batched', 'notified', 'clicked')
    and r.created_at > now() - interval '30 days'
    and public._recommendation_suppression(r.user_id, r.subject_type, r.subject_id) is null
  order by r.created_at desc, r.score desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

create or replace function public.recommendations_purge()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days    integer;
  v_recs    integer;
  v_digests integer;
  v_skips   integer;
begin
  select coalesce(s.recommendation_retention_days, 90) into v_days
  from (select 1) one
  left join public.discovery_program_setting s on s.id = 1;

  delete from public.recommendation
  where created_at < now() - make_interval(days => greatest(v_days, 7));
  get diagnostics v_recs = row_count;

  delete from public.recommendation_digest
  where created_at < now() - make_interval(days => greatest(v_days * 2, 30));
  get diagnostics v_digests = row_count;

  delete from public.recommendation_digest_skip
  where created_at < now() - interval '30 days';
  get diagnostics v_skips = row_count;

  return jsonb_build_object('recommendations', v_recs, 'digests', v_digests, 'skips', v_skips);
end;
$$;

create or replace function public.admin_recommendation_metrics(p_days integer default 14)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select least(greatest(coalesce(p_days, 14), 1), 180) as days,
           now() - make_interval(days => least(greatest(coalesce(p_days, 14), 1), 180)) as since
  ),
  recs as (select r.* from public.recommendation r, params where r.created_at > params.since),
  digests as (select d.* from public.recommendation_digest d, params where d.created_at > params.since),
  skips as (select k.* from public.recommendation_digest_skip k, params where k.created_at > params.since),
  per_user as (
    select d.user_id, d.is_shadow, count(*) as n from digests d group by 1, 2
  )
  select jsonb_build_object(
    'days', (select days from params),
    'settings', (select jsonb_build_object(
                   'enabled', s.recommendations_enabled,
                   'shadowMode', s.recommendations_shadow_mode,
                   'audience', s.recommendations_audience,
                   'promptsEnabled', s.prompts_enabled,
                   'dailyPushCap', s.daily_push_cap,
                   'weeklyPushCap', s.weekly_push_cap,
                   'watermark', s.generate_watermark)
                 from public.discovery_program_setting s where s.id = 1),
    'subscriptions', coalesce((
      select jsonb_object_agg(k.kind, jsonb_build_object('active', k.active, 'paused', k.paused, 'unsubscribed', k.unsubscribed))
      from (select kind,
                   count(*) filter (where status = 'active') as active,
                   count(*) filter (where status = 'paused') as paused,
                   count(*) filter (where status = 'unsubscribed') as unsubscribed
            from public.notification_subscription group by kind) k), '{}'::jsonb),
    'subscriptionsBySource', coalesce((
      select jsonb_object_agg(src.source, src.n)
      from (select source, count(*) as n from public.notification_subscription
            where created_at > (select since from params) group by source) src), '{}'::jsonb),
    'prompts', (
      select jsonb_build_object(
        'shown', coalesce(sum(p.shown_count), 0),
        'accepted', count(*) filter (where p.accepted_at is not null),
        'dismissed', count(*) filter (where p.dismissed_at is not null))
      from public.notification_prompt_state p
      where p.updated_at > (select since from params)),
    'candidatesByReason', coalesce((
      select jsonb_object_agg(x.reason_kind, jsonb_build_object('live', x.live, 'shadow', x.shadow))
      from (select reason_kind,
                   count(*) filter (where not is_shadow) as live,
                   count(*) filter (where is_shadow) as shadow
            from recs group by reason_kind) x), '{}'::jsonb),
    'statusCounts', coalesce((
      select jsonb_object_agg(x.status, x.n)
      from (select status, count(*) as n from recs group by status) x), '{}'::jsonb),
    'suppressedByReason', coalesce((
      select jsonb_object_agg(x.reason, x.n)
      from (select coalesce(suppress_reason, 'unknown') as reason, count(*) as n
            from recs where status = 'suppressed' group by 1) x), '{}'::jsonb),
    'digestsDaily', coalesce((
      select jsonb_agg(jsonb_build_object('date', x.digest_date, 'live', x.live, 'shadow', x.shadow,
                                          'items', x.items, 'opened', x.opened) order by x.digest_date)
      from (select digest_date,
                   count(*) filter (where not is_shadow) as live,
                   count(*) filter (where is_shadow) as shadow,
                   sum(item_count) as items,
                   count(*) filter (where opened_at is not null) as opened
            from digests group by digest_date) x), '[]'::jsonb),
    'deliveryStatus', coalesce((
      select jsonb_object_agg(x.delivery_status, x.n)
      from (select delivery_status, count(*) as n from digests group by 1) x), '{}'::jsonb),
    'perUserDigests', (
      select jsonb_build_object(
        'live', jsonb_build_object(
          'users', count(*) filter (where not is_shadow),
          'p50', percentile_disc(0.5) within group (order by n) filter (where not is_shadow),
          'p95', percentile_disc(0.95) within group (order by n) filter (where not is_shadow),
          'max', max(n) filter (where not is_shadow)),
        'shadow', jsonb_build_object(
          'users', count(*) filter (where is_shadow),
          'p50', percentile_disc(0.5) within group (order by n) filter (where is_shadow),
          'p95', percentile_disc(0.95) within group (order by n) filter (where is_shadow),
          'max', max(n) filter (where is_shadow)))
      from per_user),
    'openRate', (
      select case when count(*) = 0 then null
                  else round(count(*) filter (where opened_at is not null)::numeric / count(*), 4) end
      from digests where not is_shadow and delivery_status = 'sent'),
    'clickRate', (
      select case when count(*) filter (where status in ('notified', 'clicked', 'dismissed')) = 0 then null
                  else round(count(*) filter (where status = 'clicked')::numeric
                             / count(*) filter (where status in ('notified', 'clicked', 'dismissed')), 4) end
      from recs where not is_shadow),
    'dismissRate', (
      select case when count(*) filter (where status in ('notified', 'clicked', 'dismissed')) = 0 then null
                  else round(count(*) filter (where status = 'dismissed')::numeric
                             / count(*) filter (where status in ('notified', 'clicked', 'dismissed')), 4) end
      from recs where not is_shadow),
    'skipsByReason', coalesce((
      select jsonb_object_agg(x.key, x.n)
      from (select reason || case when is_shadow then ':shadow' else '' end as key, count(*) as n
            from skips group by 1) x), '{}'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- 8. Grants and schedules
-- ---------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public._set_published_at()',
    'public._recommendation_suppression(uuid, text, uuid)',
    'public._recommendation_reason_allowed(uuid, text)',
    'public._notification_optional_category(text)',
    'public._recommendation_delivery_outcome()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', fn);
  end loop;

  foreach fn in array array[
    'public.discovery_audience_includes(text, uuid[], uuid)',
    'public.recommendations_generate(integer)',
    'public.recommendations_build_digest(integer, boolean)',
    'public.notification_delivery_claim(integer)',
    'public.recommendation_mark_opened(uuid, uuid, text, uuid)',
    'public.recommendation_dismiss(uuid, text, uuid)',
    'public.recommendations_for_user(uuid, integer)',
    'public.recommendations_purge()',
    'public.admin_recommendation_metrics(integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

select cron.unschedule(j.jobname)
from cron.job j
where j.jobname in ('recommendations-generate', 'recommendations-digest', 'recommendations-purge');

select cron.schedule('recommendations-generate', '*/15 * * * *',
  $cron$select public.recommendations_generate(200);$cron$);
select cron.schedule('recommendations-digest', '0 * * * *',
  $cron$select public.recommendations_build_digest(5000, false);$cron$);
select cron.schedule('recommendations-purge', '40 3 * * *',
  $cron$select public.recommendations_purge();$cron$);
