-- Spotlight / Story comments in real time: database changes are BROADCAST
-- from triggers on one private topic per post, the same model messaging uses
-- (20260918120100_messaging_realtime_broadcast_from_database).
--
-- WHY. An open comment sheet showed only what it had fetched when it opened:
-- someone else's comment raised a notification, but the sheet never showed
-- it until it was reopened; a like on a comment changed nothing on anyone
-- else's screen. The app now joins `content_post:<post id>` while a post's
-- comments are open and folds these events into its cache.
--
-- TOPIC `content_post:<post id>` (private, authorised by RLS below):
--   comment_insert  {id, post_id, parent_id, author_id, created_at}
--   comment_update  {id, post_id, parent_id, visible, like_count, reply_count}
--                   -- deleted / moderated (visible=false) or a count moved
--   post_counts     {post_id, likes, comments, shares, saves}
--
-- WHAT IS NOT BROADCAST. Comment bodies and who liked what. An insert makes
-- the app fetch the newest page through the service, which applies the
-- block list and moderation, so a hidden or blocked comment never reaches a
-- screen through this channel.
--
-- WHO MAY JOIN. Signed-in accounts, for a post that is published and not
-- hidden or removed (the same posts anyone may already read). Checked once
-- per JOIN by Realtime, not once per event.
--
-- DELIVERY. realtime.send() writes inside the transaction, so nothing is
-- delivered for a write that rolls back, and it never raises, so a broadcast
-- failure cannot fail a comment or a like.

create or replace function public.content_realtime_can_join(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.content_post p
    where p.id = p_post_id
      and p.status = 'published'
      and p.moderation_state in ('visible', 'restricted')
  );
$$;

revoke execute on function public.content_realtime_can_join(uuid) from public, anon;
grant execute on function public.content_realtime_can_join(uuid) to authenticated, service_role;

drop policy if exists content_realtime_post_read on realtime.messages;
create policy content_realtime_post_read
  on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and realtime.topic() ~ '^content_post:[0-9a-fA-F-]{36}$'
    and public.content_realtime_can_join(
      (substring(realtime.topic(), '^content_post:(.+)$'))::uuid
    )
  );

-- content_comment ----------------------------------------------------------
create or replace function public.content_broadcast_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform realtime.send(
      jsonb_build_object(
        'id', new.id,
        'post_id', new.post_id,
        'parent_id', new.parent_id,
        'author_id', new.author_id,
        'created_at', new.created_at
      ),
      'comment_insert',
      'content_post:' || new.post_id::text,
      true
    );
    return null;
  end if;

  if new.status is not distinct from old.status
     and new.moderation_state is not distinct from old.moderation_state
     and new.like_count is not distinct from old.like_count
     and new.reply_count is not distinct from old.reply_count then
    return null;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'post_id', new.post_id,
      'parent_id', new.parent_id,
      'visible', new.status = 'visible'
                 and new.moderation_state in ('visible', 'restricted'),
      'like_count', new.like_count,
      'reply_count', new.reply_count
    ),
    'comment_update',
    'content_post:' || new.post_id::text,
    true
  );
  return null;
end;
$$;

revoke execute on function public.content_broadcast_comment() from public, anon, authenticated;

drop trigger if exists trg_content_broadcast_comment_insert on public.content_comment;
create trigger trg_content_broadcast_comment_insert
  after insert on public.content_comment
  for each row execute function public.content_broadcast_comment();

drop trigger if exists trg_content_broadcast_comment_update on public.content_comment;
create trigger trg_content_broadcast_comment_update
  after update on public.content_comment
  for each row execute function public.content_broadcast_comment();

-- content_post counters ----------------------------------------------------
-- Views and impressions change constantly and nobody watches them live;
-- only the counters the post's own screen shows are broadcast.
create or replace function public.content_broadcast_post_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'post_id', new.id,
      'likes', new.like_count,
      'comments', new.comment_count,
      'shares', new.share_count,
      'saves', new.save_count
    ),
    'post_counts',
    'content_post:' || new.id::text,
    true
  );
  return null;
end;
$$;

revoke execute on function public.content_broadcast_post_counts() from public, anon, authenticated;

drop trigger if exists trg_content_broadcast_post_counts on public.content_post;
create trigger trg_content_broadcast_post_counts
  after update of like_count, comment_count, share_count, save_count
  on public.content_post
  for each row
  when (
    old.like_count is distinct from new.like_count
    or old.comment_count is distinct from new.comment_count
    or old.share_count is distinct from new.share_count
    or old.save_count is distinct from new.save_count
  )
  execute function public.content_broadcast_post_counts();
