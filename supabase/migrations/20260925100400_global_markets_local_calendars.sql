-- Global markets, part 14: local calendars for Weekly and the digest.
--
-- Found in the hardening audit: two jobs still ran on the default market's
-- clock for everyone.
--   * weekly_edition_view decided "this week" in the default market's zone.
--     An area in London or Tokyo turned its edition over hours early or
--     late. The week is now the scope market's week (weekly_scope already
--     carries its country).
--   * recommendations_build_digest sent every digest at the configured hour
--     of the DEFAULT market's clock — 9am in Accra is 6pm in Tokyo — and
--     counted "today" and the daily/weekly caps by that same day. It now
--     sends at the configured hour of each person's own clock
--     (_user_timezone: their market's zone) and counts their local day.
--     The job already runs every ten minutes; the housekeeping part runs
--     once an hour instead of once a day.
-- For Ghana (UTC+0) nothing changes.

CREATE OR REPLACE FUNCTION public.weekly_edition_view(p_scope_slug text, p_week_start date DEFAULT NULL::date, p_as_of timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- Set once the scope is known: the week is the scope market's week.
  v_today     date;
  v_monday    date;
  v_scope     public.weekly_scope;
  v_national  public.weekly_scope;
  v_edition   uuid;
  v_doc       jsonb;
  v_candidate record;
begin
  -- A null slug means the national scope. An unknown or retired slug returns
  -- null (the page says the edition is unavailable) rather than quietly
  -- serving national picks under a regional address.
  if p_scope_slug is not null then
    select * into v_scope from public.weekly_scope
    where slug = lower(btrim(p_scope_slug)) and status = 'active';
    if v_scope.id is null then
      return null;
    end if;
  else
    select * into v_scope from public.weekly_scope
    where centre is null and status = 'active' and country_code = public.default_market_country();
  end if;

  v_today  := (p_as_of at time zone coalesce(
                 public.market_timezone_for_country(coalesce(v_scope.country_code, public.default_market_country())),
                 public.default_market_timezone()))::date;
  v_monday := v_today - (extract(isodow from v_today)::int - 1);

  if p_week_start is not null then
    if v_scope.id is null then
      return null;
    end if;
    select ed.id into v_edition
    from public.weekly_edition ed
    where ed.scope_id = v_scope.id and ed.week_start = p_week_start and ed.status = 'published';
    if v_edition is null then
      return null;
    end if;
    v_doc := public.weekly_edition_document(v_edition, false, p_as_of);
    if not public._weekly_document_has_content(v_doc) then
      return null;
    end if;
    return v_doc || jsonb_build_object(
      'requestedScope', v_scope.slug, 'isFallbackScope', false, 'isPreviousWeek', false, 'isCurrent', p_week_start = v_monday);
  end if;

  select * into v_national from public.weekly_scope
  where centre is null and status = 'active'
    and country_code = coalesce(v_scope.country_code, public.default_market_country())
  limit 1;

  for v_candidate in
    select c.scope_id, c.week_start, c.is_fallback, c.is_previous
    from (values
      (v_scope.id,    v_monday,     false, false, 1),
      (v_national.id, v_monday,     true,  false, 2),
      (v_scope.id,    v_monday - 7, false, true,  3),
      (v_national.id, v_monday - 7, true,  true,  4)
    ) as c(scope_id, week_start, is_fallback, is_previous, ord)
    where c.scope_id is not null
    order by c.ord
  loop
    -- The national scope asked for directly is not a fallback.
    continue when v_candidate.is_fallback and v_candidate.scope_id = v_scope.id;

    select ed.id into v_edition
    from public.weekly_edition ed
    where ed.scope_id = v_candidate.scope_id
      and ed.week_start = v_candidate.week_start
      and ed.status = 'published';

    if v_edition is not null then
      v_doc := public.weekly_edition_document(v_edition, false, p_as_of);
      if public._weekly_document_has_content(v_doc) then
        return v_doc || jsonb_build_object(
          'requestedScope', coalesce(v_scope.slug, v_national.slug),
          'isFallbackScope', v_candidate.is_fallback and v_scope.id is not null and v_scope.id <> v_national.id,
          'isPreviousWeek', v_candidate.is_previous,
          'isCurrent', true);
      end if;
    end if;
    v_edition := null;
  end loop;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.recommendations_build_digest(p_limit integer DEFAULT 5000, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s            public.discovery_program_setting;
  v_now        timestamptz := now();
  -- The digest goes out at the configured hour on each person's own clock
  -- (their market's zone), and "today" is their local day. v_today is set
  -- per person inside the loop; this value only labels the run.
  v_today      date := (now() at time zone public.default_market_timezone())::date;
  v_limit      integer := least(greatest(coalesce(p_limit, 5000), 1), 50000);
  v_users      integer := 0;
  v_live       integer := 0;
  v_shadow     integer := 0;
  v_skipped    integer := 0;
  v_emails     integer := 0;
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
  -- Housekeeping that makes the candidate set honest (once an hour; the job
  -- runs every ten minutes so every zone's digest hour is reached).
  if p_force or extract(minute from v_now) < 10 then
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
  end if;

  -- Everything the loop needs to know about a person's history is read here,
  -- once, from the state before this run.
  for grp in
    select g.user_id, g.is_shadow, g.n,
      exists (select 1 from public.notification_preference np
              where np.user_id = g.user_id and np.paused_until > v_now) as paused,
      (select count(*) from public.recommendation_digest d
       where d.user_id = g.user_id and d.is_shadow = g.is_shadow
         and d.digest_date > (v_now at time zone public._user_timezone(g.user_id))::date - 7
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
    where (p_force or extract(hour from (v_now at time zone public._user_timezone(g.user_id)))::integer
                        = s.digest_hour_local)
      and not exists (select 1 from public.recommendation_digest d
                      where d.user_id = g.user_id
                        and d.digest_date = (v_now at time zone public._user_timezone(g.user_id))::date
                        and d.is_shadow = g.is_shadow)
      and not exists (select 1 from public.recommendation_digest_skip k
                      where k.user_id = g.user_id
                        and k.digest_date = (v_now at time zone public._user_timezone(g.user_id))::date
                        and k.is_shadow = g.is_shadow)
    order by g.user_id, g.is_shadow
    limit v_limit
  loop
    v_users := v_users + 1;
    v_today := (v_now at time zone public._user_timezone(grp.user_id))::date;

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
        || trim(to_char(v_top.next_start at time zone public._user_timezone(grp.user_id), 'Dy DD Mon, FMHH12:MIam'));
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

    -- The same digest by email, only for someone who switched email on for
    -- at least one of these picks' reasons (legal item G1 gates the switch).
    if s.recommendations_email_enabled
       and exists (select 1 from public.recommendation r
                   where r.id = any (v_ids)
                     and public._recommendation_email_allowed(r.user_id, r.reason_kind)) then
      insert into public.notification_delivery (notification_id, user_id, channel, source, urgent)
      values (v_notif_id, grp.user_id, 'email', 'recommendations', false)
      on conflict (notification_id, channel) do nothing;
      v_emails := v_emails + 1;
    end if;

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
                            'emails', v_emails, 'date', v_today);
end;
$function$;

-- ---------------------------------------------------------------------------
-- place_is_open_now: the place's own clock
-- ---------------------------------------------------------------------------
-- It read the weekday and time from `p_now` in the database's zone (UTC),
-- which was right only for places on UTC+0. A London café's 09:00 opening
-- was checked against 09:00 UTC. It now reads them on place.timezone.

CREATE OR REPLACE FUNCTION public.place_is_open_now(p_place_id uuid, p_now timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_temporary_status text;
  v_zone text;
  v_local timestamp;
  v_dow smallint;
  v_time time;
  v_is_open boolean;
BEGIN
  SELECT temporary_status, timezone INTO v_temporary_status, v_zone FROM place WHERE id = p_place_id;
  IF v_temporary_status IS NOT NULL THEN
    RETURN false;
  END IF;

  v_local := p_now AT TIME ZONE coalesce(nullif(v_zone, ''), public.default_market_timezone(), 'UTC');
  v_dow := EXTRACT(DOW FROM v_local);
  v_time := v_local::time;

  SELECT EXISTS (
    SELECT 1 FROM place_opening_hours h
    WHERE h.place_id = p_place_id
      AND NOT h.is_closed
      AND h.day_of_week = v_dow
      AND (
        (h.close_time > h.open_time AND v_time BETWEEN h.open_time AND h.close_time)
        OR (h.close_time <= h.open_time AND v_time >= h.open_time)
      )
  ) OR EXISTS (
    -- overnight range that started yesterday and is still open past midnight
    SELECT 1 FROM place_opening_hours h
    WHERE h.place_id = p_place_id
      AND NOT h.is_closed
      AND h.day_of_week = ((v_dow + 6) % 7)
      AND h.close_time <= h.open_time
      AND v_time < h.close_time
  ) INTO v_is_open;

  RETURN COALESCE(v_is_open, false);
END;
$function$;
