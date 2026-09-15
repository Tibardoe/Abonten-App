-- Discovery: recommendation email, built and locked off.
--
-- LEGAL GATE: promotional email falls under legal item G1 (consent capture
-- and opt-out under Act 843), which is Open. Everything here ships OFF and
-- must stay off until G1 is Decided -- see
-- docs/LEGAL_REVIEW_REQUIRED.md and
-- docs/architecture/discovery-search-and-recommendations.md section 4.4.
--
-- The email is the same digest as the push, never a separate send: same
-- picks, same daily and weekly caps, same pause, same quiet hours for the
-- build (18:00 Accra). It only reaches someone who switched it on
-- themselves; the columns notification_preference.recommendations_email /
-- organizer_alerts_email / place_updates_email already existed and default
-- off, and nothing ever sets them for a person.
--
-- Adds:
--   * discovery_program_setting.recommendations_email_enabled (false).
--     Recommendations must also be on and out of shadow mode, and the web
--     deployment's RECOMMENDATION_EMAIL_KILL_SWITCH wins over all of it.
--   * notification_consent_event: when a person granted or withdrew email
--     consent and where (settings on web or app, the email's unsubscribe
--     page, the mail client's one-click unsubscribe). Service role only.
--   * _recommendation_push_allowed / _recommendation_email_allowed: the
--     per-reason switch for each channel. _recommendation_reason_allowed
--     (used to close picks for good) now means "some channel is still
--     open"; with email off it is exactly the old push-only rule.
--   * notification_delivery_claim: recommendation email is skipped as
--     channel_off when its switch is off, and as opted_out against the email
--     switches (push keeps the push switches).
--   * recommendations_build_digest: after the push, also queues an email
--     for the same notification when email is on and at least one pick's
--     reason has email switched on. Body otherwise unchanged from production.
--   * _recommendation_delivery_outcome: with two deliveries for one digest,
--     picks go back to candidates only when neither channel is still queued,
--     sending or sent.
--   * recommendation_digest_email_items(): the picks for an email, re-checked
--     at send time (still visible, not ended, reason still allowed by email,
--     subscription still active). Service role only.

-- ---------------------------------------------------------------------
-- 1. Switch and consent record
-- ---------------------------------------------------------------------
alter table public.discovery_program_setting
  add column if not exists recommendations_email_enabled boolean not null default false;

comment on column public.discovery_program_setting.recommendations_email_enabled is
  'Recommendation digest email. Blocked by legal item G1: must stay false until G1 is Decided.';

create table if not exists public.notification_consent_event (
  id         bigint      generated always as identity primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  channel    text        not null check (channel in ('email')),
  topic      text        not null check (topic in ('recommendations')),
  action     text        not null check (action in ('granted', 'withdrawn')),
  source     text        not null check (source in ('settings_web', 'settings_app', 'email_link', 'email_one_click')),
  created_at timestamptz not null default now()
);

comment on table public.notification_consent_event is
  'Consent history for optional email (Act 843 record): granted / withdrawn, when and from where. Service role only; retention is legal item G3.';

create index if not exists idx_notification_consent_event_user
  on public.notification_consent_event (user_id, created_at desc);

alter table public.notification_consent_event enable row level security;
revoke all on table public.notification_consent_event from anon, authenticated;
grant select, insert on table public.notification_consent_event to service_role;

-- ---------------------------------------------------------------------
-- 2. Per-channel reason switches
-- ---------------------------------------------------------------------
create or replace function public._recommendation_push_allowed(p_user uuid, p_reason text)
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

-- No row means never opted in: email is off.
create or replace function public._recommendation_email_allowed(p_user uuid, p_reason text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p_reason
      when 'organizer' then np.organizer_alerts_email
      when 'place' then np.place_updates_email
      else np.recommendations_email
    end
    from public.notification_preference np
    where np.user_id = p_user
  ), false);
$$;

create or replace function public._recommendation_reason_allowed(p_user uuid, p_reason text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public._recommendation_push_allowed(p_user, p_reason)
      or (coalesce((select s.recommendations_email_enabled
                    from public.discovery_program_setting s where s.id = 1), false)
          and public._recommendation_email_allowed(p_user, p_reason));
$$;

-- ---------------------------------------------------------------------
-- 3. Claim: channel-aware skips
-- ---------------------------------------------------------------------
create or replace function public.notification_delivery_claim(p_limit integer default 200)
returns table (
  delivery_id bigint, notification_id uuid, user_id uuid, channel text, source text,
  type text, title text, body text, link text, data jsonb, created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
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

  update public.notification_delivery d
  set status = 'skipped', detail = 'channel_off', finished_at = now()
  from public.discovery_program_setting s
  where s.id = 1
    and d.status = 'queued'
    and d.source = 'recommendations'
    and (not s.recommendations_enabled
         or s.recommendations_shadow_mode
         or (d.channel = 'email' and not s.recommendations_email_enabled));

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
          and case d.channel
                when 'email' then public._recommendation_email_allowed(r.user_id, r.reason_kind)
                else public._recommendation_push_allowed(r.user_id, r.reason_kind)
              end
          and (r.subscription_id is null or exists (
                select 1 from public.notification_subscription ns
                where ns.id = r.subscription_id and ns.status = 'active'))
      )
    );

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

-- ---------------------------------------------------------------------
-- 4. Outcome trigger: two channels, one digest
-- ---------------------------------------------------------------------
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
    return new;
  end if;

  -- The other channel for this digest is still going, or already arrived.
  if exists (
    select 1 from public.notification_delivery o
    where o.notification_id = new.notification_id
      and o.id <> new.id
      and o.status in ('queued', 'sending', 'sent')
  ) then
    return new;
  end if;

  update public.recommendation_digest set delivery_status = new.status where id = v_digest;
  update public.recommendation
  set status = 'candidate', digest_id = null, updated_at = now()
  where digest_id = v_digest and status = 'batched';
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. What an email shows, checked when it is sent
-- ---------------------------------------------------------------------
create or replace function public.recommendation_digest_email_items(p_notification_id uuid)
returns table (
  subject_type       text,
  subject_id         uuid,
  reason_kind        text,
  title              text,
  subtitle           text,
  starts_at          timestamptz,
  image_public_id    text,
  image_version      text,
  path               text,
  organizer_username text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.subject_type, r.subject_id, r.reason_kind,
         coalesce(ev.title, pl.name),
         case when r.subject_type = 'event'
              then coalesce(evpl.name, ev.address ->> 'full_address')
              else coalesce(pc.name, pl.address ->> 'full_address') end,
         case when r.subject_type = 'event'
              then coalesce((select min(o.starts_at) from public.event_occurrence o
                             where o.event_id = ev.id and o.ends_at > now()), ev.starts_at) end,
         coalesce(ev.flyer_public_id, pl.cover_public_id),
         coalesce(ev.flyer_version::text, pl.cover_version::text),
         case when r.subject_type = 'event'
              then '/events/' || lower(ev.event_code)
              else '/places/' || pl.slug end,
         org.username::text
  from public.recommendation_digest g
  join public.recommendation r on r.digest_id = g.id
  left join public.event ev on r.subject_type = 'event' and ev.id = r.subject_id
  left join public.place evpl on evpl.id = ev.place_id
  left join public.user_info org on org.id = ev.organizer_id
  left join public.place pl on r.subject_type = 'place' and pl.id = r.subject_id
  left join public.place_category pc on pc.id = pl.category_id
  where g.notification_id = p_notification_id
    and not g.is_shadow
    and r.status in ('batched', 'notified')
    and public._recommendation_subject_suppression(r.subject_type, r.subject_id) is null
    and public._recommendation_email_allowed(r.user_id, r.reason_kind)
    and (r.subscription_id is null or exists (
          select 1 from public.notification_subscription ns
          where ns.id = r.subscription_id and ns.status = 'active'))
  order by r.score desc, r.id
  limit 5;
$$;

-- ---------------------------------------------------------------------
-- 6. Digest builder: queue the email beside the push
-- ---------------------------------------------------------------------
create or replace function public.recommendations_build_digest(p_limit integer default 5000, p_force boolean default false)
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
$$;

-- ---------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public._recommendation_push_allowed(uuid, text)',
    'public._recommendation_email_allowed(uuid, text)',
    'public._recommendation_reason_allowed(uuid, text)',
    'public._recommendation_delivery_outcome()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', fn);
  end loop;

  foreach fn in array array[
    'public.recommendation_digest_email_items(uuid)',
    'public.notification_delivery_claim(integer)',
    'public.recommendations_build_digest(integer, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
