-- Spotlight & Stories: an attached event's button follows its live state
-- more precisely. The post document's event summary now also says whether
-- the event has ended and whether it is sold out, so the button reads
-- "Sold out" (still opening the event) instead of "View event", and a
-- hidden or unpublished event reads "Event unavailable" instead of the
-- misleading "Event has ended". Otherwise identical to 20260916120100.

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
              e.ends_at, now() + interval '1 day') > now(),
          'ended', coalesce(
              (select max(o.ends_at) from public.event_occurrence o where o.event_id = e.id),
              e.ends_at, now() + interval '1 day') <= now(),
          -- Same rule as @abonten/core/getEventSoldOutStatus: capacity used
          -- up, or every ticket type has a stock limit and none is left.
          'soldOut', (coalesce(e.capacity, 0) > 0
                      and public.get_event_attendance_count(e.id) >= e.capacity)
            or (exists (select 1 from public.ticket_type t where t.event_id = e.id)
                and not exists (select 1 from public.ticket_type t
                                where t.event_id = e.id and (t.quantity is null or t.quantity > 0)))
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
