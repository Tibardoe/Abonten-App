-- Story replies become private conversation messages.
--
-- Replying to (or reacting to) a Story used to close the viewer and open a
-- public comment sheet. A Story reply is a private exchange between the
-- viewer and the publisher, so it now lands in the existing messaging
-- system instead of a second one:
--
--   * a Story from a PLACE      -> the viewer's place conversation with that
--                                  place (the same get-or-create as "Chat
--                                  with place": open_conversation('place')).
--   * a Story from an ORGANIZER -> a 'direct' conversation between the viewer
--                                  (member) and the organizer. The 'direct'
--                                  type has existed in the schema since
--                                  20260907090000 but had no writer; this is
--                                  its first. One conversation per pair,
--                                  found by participants under an advisory
--                                  lock (there is no subject column to put a
--                                  unique index on).
--   * an Abonten Story          -> no replies.
--
-- The message itself goes through send_message (participant, block,
-- closed, rate-limit and restricted-account checks all stay in one place),
-- then carries its Story context in message.system_data.story_reply — the
-- column is already selected by every message read and realtime payload,
-- so no client needs a new column. The context is a snapshot (thumbnail,
-- expiry): clients show the Story preview only until expires_at.
--
-- The programme switches (Stories on for this person, replies/reactions on)
-- are checked by @abonten/services before this is called; the invariants a
-- client could otherwise bypass (live Story, not your own, replies allowed,
-- no block either way) are re-checked here. Runs on the CALLER's session
-- client like every other messaging RPC, so auth.uid() is the replier.

create or replace function public.send_story_reply(
  p_post_id uuid,
  p_content text,
  p_client_generated_id uuid default null,
  p_reply_kind text default 'text'
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_caller     uuid := auth.uid();
  v_content    text := nullif(btrim(p_content), '');
  v_post       record;
  v_target     uuid;
  v_title      text;
  v_conv_id    uuid;
  v_msg_id     uuid;
  v_recent     integer;
  v_thumb      text;
  v_media_type text;
begin
  if v_caller is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_reply_kind not in ('text', 'reaction') then
    raise exception 'Unsupported reply' using errcode = 'check_violation';
  end if;
  if v_content is null then
    raise exception 'Message cannot be empty.' using errcode = 'check_violation';
  end if;
  if p_reply_kind = 'reaction' and char_length(v_content) > 16 then
    raise exception 'Unsupported reaction' using errcode = 'check_violation';
  end if;

  select id, kind, author_id, status, moderation_state, expires_at,
         publisher_kind, publisher_place_id, allow_comments
    into v_post
    from public.content_post
    where id = p_post_id;
  if not found
     or v_post.kind <> 'story'
     or v_post.status <> 'published'
     or v_post.moderation_state not in ('visible', 'restricted')
     or v_post.expires_at is null
     or v_post.expires_at <= now() then
    raise exception 'This Story is no longer available.' using errcode = 'no_data_found';
  end if;
  if v_post.author_id = v_caller then
    raise exception 'You cannot reply to your own Story.' using errcode = 'check_violation';
  end if;
  if v_post.publisher_kind = 'abonten' then
    raise exception 'Replies are not available for this Story.' using errcode = 'check_violation';
  end if;
  if p_reply_kind = 'text' and not v_post.allow_comments then
    raise exception 'Replies are turned off for this Story.' using errcode = 'check_violation';
  end if;
  if public.content_users_blocked(v_caller, v_post.author_id) then
    raise exception 'You can''t reply to this Story.' using errcode = 'check_violation';
  end if;

  if v_post.publisher_kind = 'place' then
    -- Same conversation "Chat with place" opens (checks draft places, your
    -- own place and the new-conversation cap).
    v_conv_id := public.open_conversation('place', null, v_post.publisher_place_id);
  else
    v_target := v_post.author_id;
    -- Serialise get-or-create for this pair (either direction).
    perform pg_advisory_xact_lock(
      hashtextextended(
        'direct:' || least(v_caller, v_target)::text || ':' || greatest(v_caller, v_target)::text,
        0
      )
    );

    select c.id into v_conv_id
      from public.conversation c
      where c.type = 'direct'
        and c.status = 'open'
        and exists (
          select 1 from public.conversation_participant p
          where p.conversation_id = c.id and p.user_id = v_caller and p.left_at is null
        )
        and exists (
          select 1 from public.conversation_participant p
          where p.conversation_id = c.id and p.user_id = v_target and p.left_at is null
        )
      order by c.created_at
      limit 1;

    if v_conv_id is null then
      select count(*) into v_recent
        from public.conversation
        where created_by = v_caller and created_at > now() - interval '1 hour';
      if v_recent >= 20 then
        raise exception 'You have started a lot of conversations recently. Please try again later.'
          using errcode = 'check_violation';
      end if;

      select coalesce(nullif(btrim(ui.full_name), ''), ui.username, 'Organizer')
        into v_title
        from public.user_info ui
        where ui.id = v_target;

      insert into public.conversation (type, created_by, title)
      values ('direct', v_caller, v_title)
      returning id into v_conv_id;

      insert into public.conversation_participant (conversation_id, user_id, role)
      values (v_conv_id, v_caller, 'member'),
             (v_conv_id, v_target, 'organizer');

      insert into public.message (conversation_id, sender_id, message_type, system_event, system_data)
      values (
        v_conv_id, null, 'system', 'conversation_started',
        jsonb_build_object('initiator_id', v_caller, 'conversation_type', 'direct')
      );
    end if;
  end if;

  v_msg_id := public.send_message(
    v_conv_id, v_content, p_client_generated_id, null, 'text', '[]'::jsonb
  );

  select coalesce(m.thumbnail_url, m.poster_url, m.media_url), m.media_type
    into v_thumb, v_media_type
    from public.content_media m
    where m.post_id = p_post_id and m.status <> 'deleted'
    order by m.position
    limit 1;

  update public.message
    set system_data = jsonb_build_object(
      'story_reply', jsonb_build_object(
        'post_id', p_post_id,
        'kind', p_reply_kind,
        'story_author_id', v_post.author_id,
        'publisher_kind', v_post.publisher_kind,
        'thumbnail_url', v_thumb,
        'media_type', v_media_type,
        'expires_at', v_post.expires_at
      )
    )
    where id = v_msg_id
      and sender_id = v_caller
      and system_data = '{}'::jsonb;

  update public.conversation
    set last_message_preview = left(
          case
            when p_reply_kind = 'reaction' then 'Reacted ' || v_content || ' to a story'
            else 'Replied to a story: ' || v_content
          end, 140)
    where id = v_conv_id;

  return jsonb_build_object('conversation_id', v_conv_id, 'message_id', v_msg_id);
end;
$$;

revoke execute on function public.send_story_reply(uuid, text, uuid, text) from public, anon;
grant execute on function public.send_story_reply(uuid, text, uuid, text) to authenticated, service_role;
