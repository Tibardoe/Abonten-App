-- Spotlight + Stories content platform — part 2 of 3: reading, ranking,
-- telemetry, roll-ups, search and housekeeping.
--
-- Everything here is SECURITY DEFINER and executable by the service role
-- only; @abonten/services calls these after the transport proved identity.
-- Ranking weights come from content_program_setting (part 1) so the order
-- can be tuned without a release. Every reader applies the same visibility
-- rule (content_post_is_public + the author's account being active +
-- blocks in both directions); Stories additionally require expires_at in
-- the future by the database clock — never the client's.

-- ---------------------------------------------------------------------
-- 1. Post documents: one call returns everything a card or viewer needs
-- ---------------------------------------------------------------------
-- Returns one jsonb per requested id, in the requested order, for posts the
-- viewer may see (public rule, or the viewer is the author). Includes the
-- media list, the publisher identity, the attached event / place summary
-- and the viewer's own state (liked, reaction, saved, following, seen).
create or replace function public.content_post_documents(
  p_viewer uuid,
  p_ids uuid[]
)
returns table (post_id uuid, document jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with ids as (
    select id, ord from unnest(p_ids) with ordinality as u(id, ord)
  ),
  posts as (
    select p.*, ids.ord
    from public.content_post p
    join ids on ids.id = p.id
    where (
      public.content_post_is_public(p.status, p.moderation_state, p.kind, p.published_at, p.expires_at)
      or (p_viewer is not null and p.author_id = p_viewer)
    )
    and exists (select 1 from public.user_info u where u.id = p.author_id and u.status_id = 1)
    and not public.content_users_blocked(p_viewer, p.author_id)
  )
  select
    p.id,
    jsonb_build_object(
      'id', p.id,
      'kind', p.kind,
      'authorId', p.author_id,
      'caption', p.caption,
      'hashtags', to_jsonb(p.hashtags),
      'category', p.category,
      'status', p.status,
      'moderationState', p.moderation_state,
      'publishedAt', p.published_at,
      'expiresAt', p.expires_at,
      'allowComments', p.allow_comments,
      'allowDownload', p.allow_download,
      'counts', jsonb_build_object(
        'likes', p.like_count, 'reactions', p.reaction_count, 'comments', p.comment_count,
        'shares', p.share_count, 'saves', p.save_count, 'views', p.view_count
      ),
      'location', case when p.location is null then null else jsonb_build_object(
        'lat', extensions.st_y(p.location::extensions.geometry),
        'lng', extensions.st_x(p.location::extensions.geometry),
        'source', p.location_source) end,
      'media', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id, 'type', m.media_type, 'publicId', m.public_id, 'version', m.version,
          'width', m.width, 'height', m.height, 'durationSeconds', m.duration_seconds,
          'mediaUrl', m.media_url, 'playbackUrl', m.playback_url, 'posterUrl', m.poster_url,
          'thumbnailUrl', m.thumbnail_url, 'status', m.status, 'playbackStatus', m.playback_status,
          'position', m.position
        ) order by m.position, m.created_at)
        from public.content_media m
        where m.post_id = p.id and m.status <> 'deleted'
      ), '[]'::jsonb),
      'publisher', case p.publisher_kind
        when 'place' then (
          select jsonb_build_object(
            'kind', 'place', 'id', pl.id, 'name', pl.name, 'slug', pl.slug,
            'avatarPublicId', pl.cover_public_id, 'avatarVersion', pl.cover_version,
            'verified', pl.verified, 'ownerId', pl.owner_id
          ) from public.place pl where pl.id = p.publisher_place_id)
        when 'abonten' then jsonb_build_object(
          'kind', 'abonten', 'id', p.author_id, 'name', 'Abonten', 'username', 'abonten',
          'avatarPublicId', null, 'avatarVersion', null, 'verified', true)
        else (
          select jsonb_build_object(
            'kind', 'organizer', 'id', u.id, 'name', coalesce(u.full_name, u.username::text),
            'username', u.username, 'avatarPublicId', u.avatar_public_id,
            'avatarVersion', u.avatar_version, 'verified', coalesce(u.organizer_verified, false)
          ) from public.user_info u where u.id = p.author_id)
      end,
      'event', case when p.event_id is null then null else (
        select jsonb_build_object(
          'id', e.id, 'title', e.title, 'eventCode', e.event_code, 'status', e.status,
          'flyerPublicId', e.flyer_public_id, 'flyerVersion', e.flyer_version,
          'startsAt', coalesce(
            (select min(o.starts_at) from public.event_occurrence o
              where o.event_id = e.id and o.ends_at > now()),
            e.starts_at),
          'endsAt', coalesce(
            (select max(o.ends_at) from public.event_occurrence o where o.event_id = e.id),
            e.ends_at),
          'requireRegistration', e.require_registration,
          'archived', e.archived_at is not null,
          'available', e.status = 'published' and e.archived_at is null
            and coalesce(e.moderation_state, 'visible') not in ('hidden', 'removed')
            and coalesce(
              (select max(o.ends_at) from public.event_occurrence o where o.event_id = e.id),
              e.ends_at, now() + interval '1 day') > now()
        ) from public.event e where e.id = p.event_id) end,
      'place', case when p.place_id is null then null else (
        select jsonb_build_object(
          'id', pl.id, 'name', pl.name, 'slug', pl.slug,
          'coverPublicId', pl.cover_public_id, 'coverVersion', pl.cover_version,
          'status', pl.status, 'temporaryStatus', pl.temporary_status,
          'available', pl.status = 'published'
            and coalesce(pl.moderation_state, 'visible') not in ('hidden', 'removed')
            and coalesce(pl.temporary_status, '') <> 'permanently_closed'
        ) from public.place pl where pl.id = p.place_id) end,
      'viewer', case when p_viewer is null then jsonb_build_object(
          'liked', false, 'saved', false, 'reaction', null, 'following', false,
          'seen', false, 'isAuthor', false, 'notInterested', false)
        else jsonb_build_object(
          'liked', exists (select 1 from public.content_like l where l.post_id = p.id and l.user_id = p_viewer),
          'saved', exists (select 1 from public.content_save s where s.post_id = p.id and s.user_id = p_viewer),
          'reaction', (select r.emoji from public.content_reaction r where r.post_id = p.id and r.user_id = p_viewer),
          'following', case p.publisher_kind
            when 'place' then exists (select 1 from public.follow f where f.follower_id = p_viewer
                                        and f.target_kind = 'place' and f.target_id = p.publisher_place_id)
            when 'abonten' then true
            else exists (select 1 from public.follow f where f.follower_id = p_viewer
                           and f.target_kind = 'organizer' and f.target_id = p.author_id) end,
          'seen', exists (select 1 from public.content_story_seen ss where ss.post_id = p.id and ss.viewer_id = p_viewer),
          'isAuthor', p.author_id = p_viewer,
          'notInterested', exists (select 1 from public.content_not_interested n where n.post_id = p.id and n.user_id = p_viewer)
        ) end
    )
  from posts p
  order by p.ord
$$;

revoke all on function public.content_post_documents(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.content_post_documents(uuid, uuid[]) to service_role;

-- ---------------------------------------------------------------------
-- 2. The Spotlight feed (organic ranking). Sponsored posts are merged by
--    the service from content_sponsored_candidates().
-- ---------------------------------------------------------------------
-- p_as_of freezes the recency term for one paging session (the cursor
-- carries it), so page 2 never re-orders page 1. Keyset on (score, id).
create or replace function public.content_feed(
  p_viewer       uuid,
  p_surface      text,
  p_lat          double precision,
  p_lng          double precision,
  p_radius_km    numeric,
  p_as_of        timestamptz,
  p_cursor_score numeric,
  p_cursor_id    uuid,
  p_limit        integer
)
returns table (post_id uuid, score numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.content_program_setting%rowtype;
  v_point extensions.geography;
  v_radius_m double precision;
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
begin
  select * into s from public.content_program_setting where id = 1;
  if p_lat is not null and p_lng is not null then
    v_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  end if;
  v_radius_m := coalesce(p_radius_km, s.nearby_default_radius_km) * 1000;

  return query
  with base as (
    select
      p.id,
      p.published_at,
      p.trending_score,
      p.location,
      p.event_id,
      p.author_id,
      p.publisher_kind,
      p.publisher_place_id,
      greatest(extract(epoch from (p_as_of - p.published_at)) / 3600.0, 0) as age_h,
      (p.like_count * 3 + p.comment_count * 4 + p.share_count * 5 + p.save_count * 4 + p.view_count)::numeric
        / greatest(p.impression_count, 50)::numeric as eng,
      case when p_viewer is null then false
           when p.publisher_kind = 'place' then exists (
             select 1 from public.follow f where f.follower_id = p_viewer
               and f.target_kind = 'place' and f.target_id = p.publisher_place_id)
           when p.publisher_kind = 'abonten' then false
           else exists (
             select 1 from public.follow f where f.follower_id = p_viewer
               and f.target_kind = 'organizer' and f.target_id = p.author_id) end as following,
      case when v_point is null or p.location is null then null
           else extensions.st_distance(p.location, v_point) end as dist_m,
      case when p.event_id is null then null else (
        select min(o.starts_at) from public.event_occurrence o
        where o.event_id = p.event_id and o.starts_at > now()) end as occ_start,
      (select e.starts_at from public.event e where e.id = p.event_id) as ev_start,
      case when p_viewer is null then false else exists (
        select 1 from public.content_view v
        where v.post_id = p.id and v.viewer_id = p_viewer and v.valid
          and v.kind in ('meaningful_view', 'completion')
          and v.created_at > now() - interval '7 days') end as seen
    from public.content_post p
    where p.kind = 'spotlight'
      and p.status = 'published'
      and p.moderation_state = 'visible'
      and p.published_at <= p_as_of
      and exists (select 1 from public.user_info u where u.id = p.author_id and u.status_id = 1)
      and (p.publisher_place_id is null or exists (
        select 1 from public.place pl where pl.id = p.publisher_place_id and pl.status = 'published'
          and coalesce(pl.moderation_state, 'visible') not in ('hidden', 'removed')))
      and (p_viewer is null or not exists (
        select 1 from public.content_not_interested n where n.user_id = p_viewer and n.post_id = p.id))
      and (p_viewer is null or not public.content_users_blocked(p_viewer, p.author_id))
      and (p_surface <> 'nearby' or (v_point is not null and p.location is not null
           and extensions.st_dwithin(p.location, v_point, v_radius_m)))
      and (p_surface <> 'trending' or (s.trending_enabled and p.trending_score > 0))
      and (p_surface <> 'happening_soon' or (s.happening_soon_enabled and p.event_id is not null))
      and (p_surface <> 'following' or p_viewer is not null)
  ),
  scored as (
    select
      b.id,
      case
        when p_surface = 'trending' then round(b.trending_score, 6)
        else round(((
          s.rank_weight_recency::double precision * exp(-(b.age_h::double precision) / 72.0)
          + s.rank_weight_engagement::double precision * least(b.eng, 5)::double precision / 5.0
          + s.rank_weight_following::double precision * (case when b.following then 1 else 0 end)
          + case when p_surface = 'nearby' and b.dist_m is not null
              then s.rank_weight_proximity::double precision * greatest(0, 1 - b.dist_m / v_radius_m) else 0 end
          + case when b.event_id is not null then s.rank_weight_urgency::double precision * greatest(0, 1 - (
                extract(epoch from (coalesce(b.occ_start, b.ev_start, now() + interval '365 days') - now()))::double precision
                / (86400.0 * s.happening_soon_days))) else 0 end
        ) * (case when b.seen then 1 - s.rank_seen_penalty::double precision else 1 end))::numeric, 6)
      end as score,
      b.following,
      coalesce(b.occ_start, b.ev_start) as next_start
    from base b
  )
  select sc.id, sc.score
  from scored sc
  where (p_surface <> 'following' or sc.following)
    and (p_surface <> 'happening_soon' or (sc.next_start is not null
         and sc.next_start between now() and now() + make_interval(days => s.happening_soon_days)))
    and (p_cursor_score is null or p_cursor_id is null
         or sc.score < p_cursor_score or (sc.score = p_cursor_score and sc.id < p_cursor_id))
  order by sc.score desc, sc.id desc
  limit v_limit;
end;
$$;

revoke all on function public.content_feed(uuid, text, double precision, double precision, numeric, timestamptz, numeric, uuid, integer) from public, anon, authenticated;
grant execute on function public.content_feed(uuid, text, double precision, double precision, numeric, timestamptz, numeric, uuid, integer) to service_role;

-- Sponsored candidates for one page: active campaigns whose post is visible,
-- whose targeting matches, that the viewer has not already seen too often
-- today. The service decides where they go (share and gap settings).
create or replace function public.content_sponsored_candidates(
  p_viewer     uuid,
  p_viewer_key text,
  p_lat        double precision,
  p_lng        double precision,
  p_limit      integer
)
returns table (campaign_id uuid, post_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.content_program_setting%rowtype;
  v_point extensions.geography;
begin
  select * into s from public.content_program_setting where id = 1;
  if not s.spotlight_promotions_enabled then return; end if;
  if p_lat is not null and p_lng is not null then
    v_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  end if;
  return query
  select c.id, c.post_id
  from public.content_campaign c
  join public.content_post p on p.id = c.post_id
  where c.status = 'active'
    and c.starts_at <= now() and c.ends_at > now()
    and p.status = 'published' and p.moderation_state = 'visible'
    and (c.targeting_location is null or (v_point is not null
         and extensions.st_dwithin(c.targeting_location, v_point, coalesce(c.targeting_radius_km, 25) * 1000)))
    and (cardinality(c.targeting_categories) = 0 or p.category = any (c.targeting_categories))
    and (p_viewer is null or not public.content_users_blocked(p_viewer, p.author_id))
    and (p_viewer is null or not exists (
      select 1 from public.content_not_interested n where n.user_id = p_viewer and n.post_id = p.id))
    and (
      select count(*) from public.content_view v
      where v.campaign_id = c.id and v.kind = 'impression' and v.valid
        and v.viewer_key = p_viewer_key and v.created_at > now() - interval '1 day'
    ) < s.sponsored_daily_cap_per_viewer
  order by (c.paid_minor - c.spent_minor) desc, random()
  limit least(greatest(coalesce(p_limit, 3), 1), 10);
end;
$$;

revoke all on function public.content_sponsored_candidates(uuid, text, double precision, double precision, integer) from public, anon, authenticated;
grant execute on function public.content_sponsored_candidates(uuid, text, double precision, double precision, integer) to service_role;

-- ---------------------------------------------------------------------
-- 3. Stories: the tray and one publisher's active sequence
-- ---------------------------------------------------------------------
-- Publishers with at least one active Story that the viewer follows (or
-- the viewer themselves, or Abonten), not muted, not blocked. Own first,
-- then unseen by recency, then seen.
create or replace function public.content_story_tray(p_viewer uuid)
returns table (
  publisher_kind text,
  publisher_id uuid,
  story_ids uuid[],
  story_count integer,
  latest_at timestamptz,
  has_unseen boolean,
  is_self boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with active as (
    select p.id, p.author_id, p.publisher_kind,
           case when p.publisher_kind = 'place' then p.publisher_place_id else p.author_id end as pub_id,
           p.published_at
    from public.content_post p
    where p.kind = 'story'
      and public.content_post_is_public(p.status, p.moderation_state, p.kind, p.published_at, p.expires_at)
      and p.moderation_state = 'visible'
      and exists (select 1 from public.user_info u where u.id = p.author_id and u.status_id = 1)
      and (p.publisher_place_id is null or exists (
        select 1 from public.place pl where pl.id = p.publisher_place_id and pl.status = 'published'
          and coalesce(pl.moderation_state, 'visible') not in ('hidden', 'removed')))
      and not public.content_users_blocked(p_viewer, p.author_id)
      and (
        p.author_id = p_viewer
        or p.publisher_kind = 'abonten'
        or (p.publisher_kind = 'organizer' and exists (
          select 1 from public.follow f where f.follower_id = p_viewer
            and f.target_kind = 'organizer' and f.target_id = p.author_id))
        or (p.publisher_kind = 'place' and exists (
          select 1 from public.follow f where f.follower_id = p_viewer
            and f.target_kind = 'place' and f.target_id = p.publisher_place_id))
      )
      and not exists (
        select 1 from public.content_mute m
        where m.user_id = p_viewer and m.publisher_kind = p.publisher_kind
          and m.publisher_id = case when p.publisher_kind = 'place' then p.publisher_place_id else p.author_id end)
  ),
  grouped as (
    select a.publisher_kind, a.pub_id,
           array_agg(a.id order by a.published_at) as story_ids,
           count(*)::integer as story_count,
           max(a.published_at) as latest_at,
           bool_or(not exists (
             select 1 from public.content_story_seen ss where ss.post_id = a.id and ss.viewer_id = p_viewer)) as has_unseen,
           bool_or(a.author_id = p_viewer and a.publisher_kind <> 'abonten') as is_self
    from active a
    group by a.publisher_kind, a.pub_id
  )
  select g.publisher_kind, g.pub_id, g.story_ids, g.story_count, g.latest_at, g.has_unseen, g.is_self
  from grouped g
  order by g.is_self desc, g.has_unseen desc, g.latest_at desc
$$;

revoke all on function public.content_story_tray(uuid) from public, anon, authenticated;
grant execute on function public.content_story_tray(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 4. Telemetry ingest with validation
-- ---------------------------------------------------------------------
-- p_events: [{postId, kind, watchedMs, surface, campaignId, at}] (max 100).
-- Rules: a post must be live; the author's own views never count; each
-- (device, post) gets one valid impression and view_start per hour and one
-- meaningful view / completion per day; a meaningful view needs at least
-- meaningful_view_ms of watch time; a replay needs an earlier completion or
-- meaningful view the same day; more than views_per_viewer_per_minute events
-- from one device are stored but invalid. Invalid rows are kept with their
-- reason so abuse can be examined. Only valid rows move the cached counters,
-- campaign counters and the Story seen-state.
create or replace function public.content_view_ingest(
  p_viewer     uuid,
  p_viewer_key text,
  p_events     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s          public.content_program_setting%rowtype;
  e          jsonb;
  v_post     public.content_post%rowtype;
  v_kind     text;
  v_watched  integer;
  v_surface  text;
  v_campaign uuid;
  v_valid    boolean;
  v_reason   text;
  v_recent   integer;
  v_accepted integer := 0;
  v_invalid  integer := 0;
  v_n        integer := 0;
  v_day      date := (now() at time zone 'utc')::date;
begin
  select * into s from public.content_program_setting where id = 1;
  if p_viewer_key is null or length(p_viewer_key) < 8 then
    return jsonb_build_object('accepted', 0, 'invalid', 0, 'error', 'viewer_key');
  end if;

  select count(*) into v_recent
  from public.content_view v
  where v.viewer_key = p_viewer_key and v.created_at > now() - interval '1 minute';

  for e in select * from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) loop
    v_n := v_n + 1;
    exit when v_n > 100;
    v_valid := true;
    v_reason := null;
    v_kind := e ->> 'kind';
    v_watched := greatest(coalesce((e ->> 'watchedMs')::integer, 0), 0);
    v_surface := coalesce(e ->> 'surface', 'for_you');
    v_campaign := null;

    if v_kind not in ('impression', 'view_start', 'meaningful_view', 'completion', 'replay') then
      continue;
    end if;
    if v_surface not in ('for_you', 'following', 'nearby', 'happening_soon', 'trending',
                         'stories', 'profile', 'deep_link', 'search', 'embed') then
      v_surface := 'for_you';
    end if;

    begin
      select * into v_post from public.content_post p where p.id = (e ->> 'postId')::uuid;
    exception when others then
      continue;
    end;
    if not found then continue; end if;

    if not public.content_post_is_public(v_post.status, v_post.moderation_state, v_post.kind, v_post.published_at, v_post.expires_at) then
      v_valid := false; v_reason := 'post_unavailable';
    elsif p_viewer is not null and p_viewer = v_post.author_id then
      v_valid := false; v_reason := 'self';
    elsif v_recent + v_n > s.views_per_viewer_per_minute then
      v_valid := false; v_reason := 'rate_limited';
    elsif v_watched > 86400000 then
      v_valid := false; v_reason := 'implausible_watch_time';
    elsif v_kind in ('impression', 'view_start') and exists (
      select 1 from public.content_view v
      where v.viewer_key = p_viewer_key and v.post_id = v_post.id and v.kind = v_kind and v.valid
        and v.created_at > now() - interval '1 hour') then
      v_valid := false; v_reason := 'duplicate';
    elsif v_kind = 'meaningful_view' and v_watched < s.meaningful_view_ms then
      v_valid := false; v_reason := 'too_short';
    elsif v_kind in ('meaningful_view', 'completion') and exists (
      select 1 from public.content_view v
      where v.viewer_key = p_viewer_key and v.post_id = v_post.id and v.kind = v_kind and v.valid
        and v.created_at >= v_day) then
      v_valid := false; v_reason := 'duplicate';
    elsif v_kind = 'replay' and not exists (
      select 1 from public.content_view v
      where v.viewer_key = p_viewer_key and v.post_id = v_post.id and v.valid
        and v.kind in ('meaningful_view', 'completion') and v.created_at >= v_day) then
      v_valid := false; v_reason := 'replay_without_view';
    end if;

    -- A campaign id only counts when that campaign is live for this post.
    if (e ->> 'campaignId') is not null then
      begin
        select c.id into v_campaign
        from public.content_campaign c
        where c.id = (e ->> 'campaignId')::uuid and c.post_id = v_post.id
          and c.status = 'active' and c.starts_at <= now() and c.ends_at > now();
      exception when others then
        v_campaign := null;
      end;
    end if;

    insert into public.content_view (post_id, viewer_id, viewer_key, kind, watched_ms, surface, campaign_id, valid, invalid_reason)
    values (v_post.id, p_viewer, p_viewer_key, v_kind, v_watched, v_surface, v_campaign, v_valid, v_reason);

    if v_valid then
      v_accepted := v_accepted + 1;
      if v_kind = 'impression' then
        update public.content_post set impression_count = impression_count + 1 where id = v_post.id;
        if v_campaign is not null then
          update public.content_campaign set impression_count = impression_count + 1 where id = v_campaign;
        end if;
      elsif v_kind = 'meaningful_view' then
        update public.content_post set view_count = view_count + 1 where id = v_post.id;
        if v_campaign is not null then
          update public.content_campaign set view_count = view_count + 1 where id = v_campaign;
        end if;
      end if;
      if v_post.kind = 'story' and p_viewer is not null and v_kind in ('view_start', 'meaningful_view', 'completion') then
        insert into public.content_story_seen (post_id, viewer_id, completed)
        values (v_post.id, p_viewer, v_kind = 'completion')
        on conflict (post_id, viewer_id) do update
          set last_seen_at = now(), completed = public.content_story_seen.completed or excluded.completed;
      end if;
    else
      v_invalid := v_invalid + 1;
    end if;
  end loop;

  return jsonb_build_object('accepted', v_accepted, 'invalid', v_invalid);
end;
$$;

revoke all on function public.content_view_ingest(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.content_view_ingest(uuid, text, jsonb) to service_role;

-- Clicks: profile / event / place / ticket / cta / hashtag. One valid click
-- per (device, post, kind) per hour; the author's own clicks never count.
create or replace function public.content_click_ingest(
  p_viewer     uuid,
  p_viewer_key text,
  p_post_id    uuid,
  p_kind       text,
  p_campaign   uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post     public.content_post%rowtype;
  v_campaign uuid;
  v_valid    boolean := true;
  v_reason   text;
begin
  if p_viewer_key is null or length(p_viewer_key) < 8 then
    return jsonb_build_object('accepted', false, 'reason', 'viewer_key');
  end if;
  if p_kind not in ('profile', 'event', 'place', 'ticket', 'cta', 'hashtag') then
    return jsonb_build_object('accepted', false, 'reason', 'kind');
  end if;
  select * into v_post from public.content_post where id = p_post_id;
  if not found then
    return jsonb_build_object('accepted', false, 'reason', 'post');
  end if;
  if not public.content_post_is_public(v_post.status, v_post.moderation_state, v_post.kind, v_post.published_at, v_post.expires_at) then
    v_valid := false; v_reason := 'post_unavailable';
  elsif p_viewer is not null and p_viewer = v_post.author_id then
    v_valid := false; v_reason := 'self';
  elsif exists (
    select 1 from public.content_click c
    where c.viewer_key = p_viewer_key and c.post_id = p_post_id and c.kind = p_kind and c.valid
      and c.created_at > now() - interval '1 hour') then
    v_valid := false; v_reason := 'duplicate';
  end if;

  if p_campaign is not null then
    select c.id into v_campaign from public.content_campaign c
    where c.id = p_campaign and c.post_id = p_post_id and c.status = 'active'
      and c.starts_at <= now() and c.ends_at > now();
  end if;

  insert into public.content_click (post_id, viewer_id, viewer_key, kind, campaign_id, valid, invalid_reason)
  values (p_post_id, p_viewer, p_viewer_key, p_kind, v_campaign, v_valid, v_reason);

  if v_valid and v_campaign is not null then
    update public.content_campaign set click_count = click_count + 1 where id = v_campaign;
  end if;

  return jsonb_build_object('accepted', v_valid, 'reason', v_reason);
end;
$$;

revoke all on function public.content_click_ingest(uuid, text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.content_click_ingest(uuid, text, uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 5. Hourly roll-up into content_post_daily_stat (validated rows only)
-- ---------------------------------------------------------------------
create or replace function public.content_rollup_stats(p_batch integer default 20000)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  st         public.content_rollup_state%rowtype;
  v_view_max bigint;
  v_click_max bigint;
  v_touched  integer := 0;
begin
  select * into st from public.content_rollup_state where id = true for update;

  select coalesce(max(id), st.view_id) into v_view_max
  from (select id from public.content_view where id > st.view_id order by id limit p_batch) x;
  select coalesce(max(id), st.click_id) into v_click_max
  from (select id from public.content_click where id > st.click_id order by id limit p_batch) x;

  -- Views
  insert into public.content_post_daily_stat as d
    (post_id, day, impressions, view_starts, meaningful_views, completions, replays, watched_ms_total)
  select v.post_id, (v.created_at at time zone 'utc')::date,
         count(*) filter (where v.kind = 'impression'),
         count(*) filter (where v.kind = 'view_start'),
         count(*) filter (where v.kind = 'meaningful_view'),
         count(*) filter (where v.kind = 'completion'),
         count(*) filter (where v.kind = 'replay'),
         coalesce(sum(v.watched_ms) filter (where v.kind in ('meaningful_view', 'completion')), 0)
  from public.content_view v
  where v.id > st.view_id and v.id <= v_view_max and v.valid
  group by v.post_id, (v.created_at at time zone 'utc')::date
  on conflict (post_id, day) do update set
    impressions      = d.impressions + excluded.impressions,
    view_starts      = d.view_starts + excluded.view_starts,
    meaningful_views = d.meaningful_views + excluded.meaningful_views,
    completions      = d.completions + excluded.completions,
    replays          = d.replays + excluded.replays,
    watched_ms_total = d.watched_ms_total + excluded.watched_ms_total,
    updated_at       = now();
  get diagnostics v_touched = row_count;

  -- Clicks
  insert into public.content_post_daily_stat as d
    (post_id, day, profile_clicks, event_clicks, place_clicks, ticket_clicks, cta_clicks)
  select c.post_id, (c.created_at at time zone 'utc')::date,
         count(*) filter (where c.kind = 'profile'),
         count(*) filter (where c.kind = 'event'),
         count(*) filter (where c.kind = 'place'),
         count(*) filter (where c.kind = 'ticket'),
         count(*) filter (where c.kind in ('cta', 'hashtag'))
  from public.content_click c
  where c.id > st.click_id and c.id <= v_click_max and c.valid
  group by c.post_id, (c.created_at at time zone 'utc')::date
  on conflict (post_id, day) do update set
    profile_clicks = d.profile_clicks + excluded.profile_clicks,
    event_clicks   = d.event_clicks + excluded.event_clicks,
    place_clicks   = d.place_clicks + excluded.place_clicks,
    ticket_clicks  = d.ticket_clicks + excluded.ticket_clicks,
    cta_clicks     = d.cta_clicks + excluded.cta_clicks,
    updated_at     = now();

  -- Unique viewers and engagement are absolute counts, recomputed for the
  -- (post, day) pairs touched in the last two days.
  update public.content_post_daily_stat d
  set unique_viewers = (
        select count(distinct v.viewer_key) from public.content_view v
        where v.post_id = d.post_id and v.valid and v.kind = 'meaningful_view'
          and (v.created_at at time zone 'utc')::date = d.day),
      likes    = (select count(*) from public.content_like l
                  where l.post_id = d.post_id and (l.created_at at time zone 'utc')::date = d.day),
      comments = (select count(*) from public.content_comment c
                  where c.post_id = d.post_id and c.status = 'visible'
                    and (c.created_at at time zone 'utc')::date = d.day),
      shares   = (select count(*) from public.content_share sh
                  where sh.post_id = d.post_id and (sh.created_at at time zone 'utc')::date = d.day),
      saves    = (select count(*) from public.content_save sv
                  where sv.post_id = d.post_id and (sv.created_at at time zone 'utc')::date = d.day),
      updated_at = now()
  where d.day >= ((now() at time zone 'utc')::date - 1);

  update public.content_rollup_state
  set view_id = v_view_max, click_id = v_click_max, last_run_at = now()
  where id = true;

  return jsonb_build_object('views_to', v_view_max, 'clicks_to', v_click_max, 'rows', v_touched);
end;
$$;

revoke all on function public.content_rollup_stats(integer) from public, anon, authenticated;
grant execute on function public.content_rollup_stats(integer) to service_role;

-- ---------------------------------------------------------------------
-- 6. Trending
-- ---------------------------------------------------------------------
create or replace function public.content_trending_refresh()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.content_program_setting%rowtype;
  v_since timestamptz;
  v_n integer;
begin
  select * into s from public.content_program_setting where id = 1;
  v_since := now() - make_interval(hours => s.trending_window_hours);

  with cand as (
    select p.id,
           greatest(extract(epoch from (now() - p.published_at)) / 3600.0, 0) as age_h,
           (select count(*) from public.content_view v
              where v.post_id = p.id and v.valid and v.kind = 'meaningful_view' and v.created_at > v_since) as views,
           (select count(*) from public.content_like l where l.post_id = p.id and l.created_at > v_since) as likes,
           (select count(*) from public.content_comment c where c.post_id = p.id and c.status = 'visible' and c.created_at > v_since) as comments,
           (select count(*) from public.content_share sh where sh.post_id = p.id and sh.created_at > v_since) as shares,
           (select count(*) from public.content_save sv where sv.post_id = p.id and sv.created_at > v_since) as saves
    from public.content_post p
    where p.kind = 'spotlight' and p.status = 'published' and p.moderation_state = 'visible'
      and p.published_at > now() - make_interval(hours => s.trending_window_hours * 3)
  )
  update public.content_post p
  set trending_score = round(
        ((c.views + c.likes * 3 + c.comments * 4 + c.shares * 5 + c.saves * 4)::double precision
        / power((c.age_h + 2)::double precision, 1.2))::numeric, 6),
      trending_computed_at = now()
  from cand c
  where p.id = c.id;
  get diagnostics v_n = row_count;

  update public.content_post
  set trending_score = 0, trending_computed_at = now()
  where trending_score <> 0
    and (kind <> 'spotlight' or status <> 'published' or moderation_state <> 'visible'
         or published_at <= now() - make_interval(hours => s.trending_window_hours * 3));

  return v_n;
end;
$$;

revoke all on function public.content_trending_refresh() from public, anon, authenticated;
grant execute on function public.content_trending_refresh() to service_role;

-- ---------------------------------------------------------------------
-- 7. Search: Spotlight captions and hashtags
-- ---------------------------------------------------------------------
create or replace function public.search_spotlight(
  p_query  text,
  p_viewer uuid,
  p_limit  integer default 20
)
returns table (post_id uuid, rank real)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select
      websearch_to_tsquery('simple', coalesce(p_query, '')) as tsq,
      lower(regexp_replace(coalesce(p_query, ''), '^#', '')) as tag
  )
  select p.id,
         (ts_rank(p.search_tsv, q.tsq) + (case when q.tag = any (p.hashtags) then 1.0 else 0 end)::real
          + least(p.trending_score, 1)::real * 0.2::real)::real as rank
  from public.content_post p, q
  where p.kind = 'spotlight'
    and public.content_post_is_public(p.status, p.moderation_state, p.kind, p.published_at, p.expires_at)
    and p.moderation_state = 'visible'
    and (p.search_tsv @@ q.tsq or q.tag = any (p.hashtags))
    and exists (select 1 from public.user_info u where u.id = p.author_id and u.status_id = 1)
    and not public.content_users_blocked(p_viewer, p.author_id)
  order by rank desc, p.published_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

revoke all on function public.search_spotlight(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.search_spotlight(text, uuid, integer) to service_role;

-- ---------------------------------------------------------------------
-- 8. Housekeeping: retention and orphan media
-- ---------------------------------------------------------------------
-- Expired Stories and deleted posts are kept for the retention period
-- (reports, moderation, audit), then their media is marked deleted and
-- queued for Cloudinary destruction (draft_asset_cleanup_queue, drained by
-- the maintenance route). Media never attached to a post is queued after
-- orphan_media_hours. Raw telemetry is purged after raw_view_retention_days
-- (the daily roll-ups keep the numbers).
create or replace function public.content_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.content_program_setting%rowtype;
  v_stories integer := 0;
  v_deleted integer := 0;
  v_orphans integer := 0;
  v_views integer := 0;
  v_clicks integer := 0;
  v_seen integer := 0;
begin
  select * into s from public.content_program_setting where id = 1;

  -- 1. Expired Stories past retention: archive the post, retire the media.
  with due as (
    update public.content_post p
    set status = 'archived', deleted_at = coalesce(p.deleted_at, now())
    where p.kind = 'story' and p.status = 'published'
      and p.expires_at < now() - make_interval(days => s.expired_story_retention_days)
    returning p.id
  )
  select count(*) into v_stories from due;

  -- 2. Media of archived/deleted posts past retention -> deleted + queued.
  with due as (
    update public.content_media m
    set status = 'deleted', deleted_at = coalesce(m.deleted_at, now())
    from public.content_post p
    where m.post_id = p.id and m.status <> 'deleted'
      and p.status in ('archived', 'deleted')
      and coalesce(p.deleted_at, p.updated_at) < now() - make_interval(days => s.deleted_post_retention_days)
    returning m.public_id, m.media_type
  ), queued as (
    insert into public.draft_asset_cleanup_queue (public_id, resource_type)
    select public_id, media_type from due
    returning 1
  )
  select count(*) into v_deleted from queued;

  -- 3. Orphans: registered but never attached.
  with due as (
    update public.content_media m
    set status = 'deleted', deleted_at = now()
    where m.post_id is null and m.status <> 'deleted'
      and m.created_at < now() - make_interval(hours => s.orphan_media_hours)
    returning m.public_id, m.media_type
  ), queued as (
    insert into public.draft_asset_cleanup_queue (public_id, resource_type)
    select public_id, media_type from due
    returning 1
  )
  select count(*) into v_orphans from queued;

  -- 4. Deleted media whose destruction was queued: mark purged (the queue
  --    drain removes the asset; a re-queue is harmless because destroy is
  --    idempotent on Cloudinary's side).
  update public.content_media
  set purged_at = now()
  where status = 'deleted' and purged_at is null
    and not exists (select 1 from public.draft_asset_cleanup_queue q where q.public_id = content_media.public_id);

  -- 5. Raw telemetry retention.
  with d as (
    delete from public.content_view where created_at < now() - make_interval(days => s.raw_view_retention_days)
    returning 1
  ) select count(*) into v_views from d;
  with d as (
    delete from public.content_click where created_at < now() - make_interval(days => s.raw_view_retention_days)
    returning 1
  ) select count(*) into v_clicks from d;

  -- 6. Seen-state of Stories that are long gone.
  with d as (
    delete from public.content_story_seen ss
    using public.content_post p
    where p.id = ss.post_id and p.kind = 'story' and p.expires_at < now() - interval '60 days'
    returning 1
  ) select count(*) into v_seen from d;

  return jsonb_build_object(
    'stories_archived', v_stories, 'media_queued', v_deleted, 'orphans_queued', v_orphans,
    'views_purged', v_views, 'clicks_purged', v_clicks, 'seen_purged', v_seen);
end;
$$;

revoke all on function public.content_housekeeping() from public, anon, authenticated;
grant execute on function public.content_housekeeping() to service_role;

-- ---------------------------------------------------------------------
-- 9. Jobs
-- ---------------------------------------------------------------------
select cron.unschedule(j.jobname)
from cron.job j
where j.jobname in ('content-stats-rollup', 'content-trending-refresh', 'content-housekeeping');

select cron.schedule('content-stats-rollup',     '20 * * * *', $$select public.content_rollup_stats(20000);$$);
select cron.schedule('content-trending-refresh', '25 * * * *', $$select public.content_trending_refresh();$$);
select cron.schedule('content-housekeeping',     '50 3 * * *', $$select public.content_housekeeping();$$);
