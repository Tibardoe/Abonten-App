-- Discovery recommendations: make the engine scale with subscribers.
--
-- Measured with scripts/perf (10,000 subscribers, 60,000 subscriptions, 50
-- newly published events, one organizer followed by all 10,000):
--   recommendations_generate      12.6 s for 132,844 candidates
--   recommendations_build_digest  38.7 s for 10,000 people
-- Three causes, three fixes:
--
-- 1. Suppression ran a PL/pgSQL function per candidate row, re-reading the
--    subject (visible? ended?) for every one of the 10,000 followers of the
--    same event, and the audience check ran a function per row too. The
--    subject checks now run once per subject (_recommendation_subject_
--    suppression) and the per-person checks are plain SQL in the same
--    statement. Reasons and their order are unchanged.
--
-- 2. The digest loop asked recommendation_digest four questions per person
--    (already sent today? weekly count? unopened streak? organizer
--    cooldown?) while inserting into that same table. PL/pgSQL caches a
--    generic plan after a few calls, planned while the table was nearly
--    empty, so each lookup became a scan of a growing table: quadratic in
--    the number of people. The answers are now read once, in the query that
--    drives the loop, from the state before the run. Every person appears
--    once per run, so the answers are identical.
--
-- 3. The cron job ran hourly with a 5,000-person limit and acted only in the
--    digest hour, so anyone after the first 5,000 (ordered by user id) never
--    got a digest. The loop now skips people who already have a digest or a
--    skip row for today, and the job runs every 10 minutes: each run in the
--    digest hour picks up where the previous one stopped.
--
-- Also: the notification row is written before the digest row (the digest id
-- is generated up front), which removes one UPDATE and one foreign-key check
-- per person. Signatures, grants, return shapes and behaviour are unchanged
-- apart from the batching described in 3.

-- ---------------------------------------------------------------------
-- 1. Subject-level suppression, evaluated once per subject
-- ---------------------------------------------------------------------
create or replace function public._recommendation_subject_suppression(
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
  if p_subject_type = 'event' then
    select ev.id, ev.status, ev.archived_at, ev.moderation_state, ev.starts_at, ev.ends_at
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
    return null;
  end if;

  select pl.id, pl.status, pl.moderation_state, pl.temporary_status
    into p
  from public.place pl where pl.id = p_subject_id;
  if not found
     or p.status <> 'published'
     or p.moderation_state is not distinct from 'hidden'
     or p.moderation_state is not distinct from 'removed'
     or p.temporary_status is not distinct from 'permanently_closed' then
    return 'not_visible';
  end if;
  return null;
end;
$$;

revoke all on function public._recommendation_subject_suppression(text, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Candidate generation
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
  v_subject_reason text;
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
    v_subject_reason := public._recommendation_subject_suppression(subj.subject_type, subj.id);

    if subj.subject_type = 'event' then
      insert into public.recommendation (
        user_id, subject_type, subject_id, reason_kind, subscription_id, basis, score,
        is_shadow, status, suppress_reason
      )
      select c.user_id, 'event', c.event_id, c.reason_kind, c.subscription_id, c.basis, c.score,
             c.is_shadow,
             case when c.suppress is not null then 'suppressed'
                  when c.is_shadow then 'shadow'
                  else 'candidate' end,
             c.suppress
      from (
        select
          m.user_id, ev.id as event_id, m.reason_kind, m.subscription_id, m.basis,
          round(m.score::numeric, 6) as score,
          (s.recommendations_shadow_mode
            or not (
              s.recommendations_audience = 'all'
              or (s.recommendations_audience = 'beta' and m.user_id = any (coalesce(s.beta_user_ids, '{}')))
              or exists (select 1 from public.admin_user a where a.user_id = m.user_id and a.status = 'active')
            )) as is_shadow,
          case
            when u.status_id is distinct from 1 then 'inactive_user'
            when v_subject_reason is not null then v_subject_reason
            when ev.organizer_id = m.user_id then 'own_subject'
            when exists (select 1 from public.attendance a
                         where a.event_id = ev.id and a.user_id = m.user_id and a.status = 'attending') then 'attending'
            when exists (select 1 from public.favorite f
                         where f.user_id = m.user_id and f.event_id = ev.id and f.deleted_at is null) then 'saved'
            when exists (select 1 from public.event_reminder r
                         where r.user_id = m.user_id and r.event_id = ev.id) then 'reminded'
          end as suppress
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
        left join public.user_info u on u.id = m.user_id
        where ev.id = subj.id
      ) c
      on conflict (user_id, subject_type, subject_id) do nothing;
    else
      insert into public.recommendation (
        user_id, subject_type, subject_id, reason_kind, subscription_id, basis, score,
        is_shadow, status, suppress_reason
      )
      select m.user_id, 'place', m.place_id, 'similar_places', m.id, m.basis, m.score,
             m.is_shadow,
             case when m.suppress is not null then 'suppressed'
                  when m.is_shadow then 'shadow'
                  else 'candidate' end,
             m.suppress
      from (
        select ns2.user_id, ns2.id, pl.id as place_id,
               jsonb_build_object(
                 'category', pc.slug,
                 'distanceKm', round((extensions.st_distance(ns2.topic_location, pl.location) / 1000)::numeric, 1)) as basis,
               round((0.5 * exp(greatest(-50.0, -0.693147 * (extensions.st_distance(ns2.topic_location, pl.location) / 1000)
                               / greatest(ns2.topic_radius_km::double precision / 2, 0.5))))::numeric, 6) as score,
               (s.recommendations_shadow_mode
                 or not (
                   s.recommendations_audience = 'all'
                   or (s.recommendations_audience = 'beta' and ns2.user_id = any (coalesce(s.beta_user_ids, '{}')))
                   or exists (select 1 from public.admin_user a where a.user_id = ns2.user_id and a.status = 'active')
                 )) as is_shadow,
               case
                 when u.status_id is distinct from 1 then 'inactive_user'
                 when v_subject_reason is not null then v_subject_reason
                 when pl.owner_id = ns2.user_id then 'own_subject'
                 when exists (select 1 from public.favorite_place f
                              where f.user_id = ns2.user_id and f.place_id = pl.id) then 'saved'
                 when exists (select 1 from public.place_visit v
                              where v.user_id = ns2.user_id and v.place_id = pl.id) then 'visited'
               end as suppress
        from public.place pl
        join public.place_category pc on pc.id = pl.category_id
        join public.notification_subscription ns2
          on ns2.kind = 'similar_places' and ns2.status = 'active'
         and lower(ns2.topic_category) = lower(pc.slug)
         and pl.location is not null
         and extensions.st_dwithin(ns2.topic_location, pl.location, (ns2.topic_radius_km * 1000)::double precision)
        left join public.user_info u on u.id = ns2.user_id
        where pl.id = subj.id
      ) m
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
-- 3. Daily digest
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

  -- Same reasons, same order as _recommendation_suppression; subject checks
  -- once per subject.
  with subj as materialized (
    select x.subject_type, x.subject_id,
           public._recommendation_subject_suppression(x.subject_type, x.subject_id) as reason
    from (
      select distinct r2.subject_type, r2.subject_id
      from public.recommendation r2
      where r2.status in ('candidate', 'shadow') and r2.digest_id is null
    ) x
  ),
  decided as (
    select r2.id,
      case
        when u.status_id is distinct from 1 then 'inactive_user'
        when subj.reason is not null then subj.reason
        when r2.subject_type = 'event' and ev.organizer_id = r2.user_id then 'own_subject'
        when r2.subject_type = 'event' and exists (
          select 1 from public.attendance a
          where a.event_id = r2.subject_id and a.user_id = r2.user_id and a.status = 'attending') then 'attending'
        when r2.subject_type = 'event' and exists (
          select 1 from public.favorite f
          where f.user_id = r2.user_id and f.event_id = r2.subject_id and f.deleted_at is null) then 'saved'
        when r2.subject_type = 'event' and exists (
          select 1 from public.event_reminder er
          where er.user_id = r2.user_id and er.event_id = r2.subject_id) then 'reminded'
        when r2.subject_type = 'place' and pl.owner_id = r2.user_id then 'own_subject'
        when r2.subject_type = 'place' and exists (
          select 1 from public.favorite_place fp
          where fp.user_id = r2.user_id and fp.place_id = r2.subject_id) then 'saved'
        when r2.subject_type = 'place' and exists (
          select 1 from public.place_visit pv
          where pv.user_id = r2.user_id and pv.place_id = r2.subject_id) then 'visited'
      end as reason
    from public.recommendation r2
    join subj on subj.subject_type = r2.subject_type and subj.subject_id = r2.subject_id
    left join public.user_info u on u.id = r2.user_id
    left join public.event ev on r2.subject_type = 'event' and ev.id = r2.subject_id
    left join public.place pl on r2.subject_type = 'place' and pl.id = r2.subject_id
    where r2.status in ('candidate', 'shadow') and r2.digest_id is null
  )
  update public.recommendation r
  set status = 'suppressed', suppress_reason = d.reason, updated_at = v_now
  from decided d
  where r.id = d.id and d.reason is not null;

  -- Everything the loop needs to know about a person's history is read here,
  -- once, from the state before this run.
  for grp in
    select g.user_id, g.is_shadow, g.n,
      exists (select 1 from public.notification_preference np
              where np.user_id = g.user_id and np.paused_until > v_now) as paused,
      (select count(*) from public.recommendation_digest d
       where d.user_id = g.user_id and d.is_shadow = g.is_shadow
         and d.digest_date > v_today - 7
         and d.delivery_status in ('shadow', 'pending', 'sent')) as recent,
      h.sent_count, h.unopened_count,
      coalesce((
        select array_agg(distinct o.organizer_id)
        from public.recommendation_digest d
        cross join lateral unnest(d.organizer_ids) as o(organizer_id)
        where d.user_id = g.user_id and d.is_shadow = g.is_shadow
          and d.created_at > v_now - make_interval(hours => s.organizer_cooldown_hours)
      ), '{}'::uuid[]) as cooldown_organizers
    from (
      select r.user_id, r.is_shadow, count(*) as n
      from public.recommendation r
      where r.status in ('candidate', 'shadow') and r.digest_id is null
      group by r.user_id, r.is_shadow
    ) g
    cross join lateral (
      select count(*) as sent_count, count(*) filter (where last_sent.opened_at is null) as unopened_count
      from (
        select d2.opened_at
        from public.recommendation_digest d2
        where d2.user_id = g.user_id and not d2.is_shadow and d2.delivery_status = 'sent'
        order by d2.created_at desc
        limit s.ignore_pause_after
      ) last_sent
    ) h
    where not exists (select 1 from public.recommendation_digest d
                      where d.user_id = g.user_id and d.digest_date = v_today and d.is_shadow = g.is_shadow)
      and not exists (select 1 from public.recommendation_digest_skip k
                      where k.user_id = g.user_id and k.digest_date = v_today and k.is_shadow = g.is_shadow)
    order by g.user_id, g.is_shadow
    limit v_limit
  loop
    v_users := v_users + 1;

    if s.daily_push_cap = 0 then
      insert into public.recommendation_digest_skip (user_id, digest_date, is_shadow, reason, candidate_count)
      values (grp.user_id, v_today, grp.is_shadow, 'daily_cap', grp.n);
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if grp.paused then
      insert into public.recommendation_digest_skip (user_id, digest_date, is_shadow, reason, candidate_count)
      values (grp.user_id, v_today, grp.is_shadow, 'paused', grp.n);
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if grp.recent >= s.weekly_push_cap then
      insert into public.recommendation_digest_skip (user_id, digest_date, is_shadow, reason, candidate_count)
      values (grp.user_id, v_today, grp.is_shadow, 'weekly_cap', grp.n);
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Several delivered digests in a row nobody opened: pause, don't nag.
    if not grp.is_shadow
       and grp.sent_count >= s.ignore_pause_after
       and grp.unopened_count = grp.sent_count then
      insert into public.notification_preference (user_id, paused_until, updated_at)
      values (grp.user_id, v_now + make_interval(days => s.ignore_pause_days), v_now)
      on conflict (user_id) do update
        set paused_until = excluded.paused_until, updated_at = excluded.updated_at;
      insert into public.recommendation_digest_skip (user_id, digest_date, is_shadow, reason, candidate_count)
      values (grp.user_id, v_today, grp.is_shadow, 'ignored', grp.n);
      v_skipped := v_skipped + 1;
      continue;
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
          and ev.organizer_id = any (grp.cooldown_organizers)
          and coalesce((select min(o.starts_at) from public.event_occurrence o
                        where o.event_id = ev.id and o.ends_at > v_now), ev.starts_at)
              > v_now + interval '48 hours'
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
    v_digest_id := gen_random_uuid();

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

    if grp.is_shadow then
      insert into public.recommendation_digest (
        id, user_id, digest_date, is_shadow, item_count, top_subject_type, top_subject_id,
        organizer_ids, categories, delivery_status
      ) values (
        v_digest_id, grp.user_id, v_today, true, v_items.n, v_top.subject_type, v_top.subject_id,
        coalesce(v_items.organizers, '{}'), coalesce(v_items.categories, '{}'), 'shadow'
      );
      update public.recommendation r
      set digest_id = v_digest_id, updated_at = v_now
      where r.id = any (v_ids);
      v_shadow := v_shadow + 1;
      continue;
    end if;

    v_title := null;
    v_link := null;
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

    insert into public.recommendation_digest (
      id, user_id, digest_date, is_shadow, item_count, top_subject_type, top_subject_id,
      organizer_ids, categories, notification_id, delivery_status
    ) values (
      v_digest_id, grp.user_id, v_today, false, v_items.n, v_top.subject_type, v_top.subject_id,
      coalesce(v_items.organizers, '{}'), coalesce(v_items.categories, '{}'), v_notif_id, 'pending'
    );

    insert into public.notification_delivery (notification_id, user_id, channel, source, urgent)
    values (v_notif_id, grp.user_id, 'push', 'recommendations', false)
    on conflict (notification_id, channel) do nothing;

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

-- Grants are kept by create or replace; restated for a fresh replay.
revoke all on function public.recommendations_generate(integer) from public, anon, authenticated;
grant execute on function public.recommendations_generate(integer) to service_role;
revoke all on function public.recommendations_build_digest(integer, boolean) from public, anon, authenticated;
grant execute on function public.recommendations_build_digest(integer, boolean) to service_role;

-- ---------------------------------------------------------------------
-- 4. Digest schedule: every 10 minutes, acts only in the digest hour, each
--    run continues where the previous one stopped.
-- ---------------------------------------------------------------------
select cron.unschedule(j.jobname)
from cron.job j
where j.jobname = 'recommendations-digest';

select cron.schedule('recommendations-digest', '*/10 * * * *',
  $cron$select public.recommendations_build_digest(20000, false);$cron$);
