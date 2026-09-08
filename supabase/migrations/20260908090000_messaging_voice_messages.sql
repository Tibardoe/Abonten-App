-- In-app messaging — voice notes.
--
-- Adds an 'audio' message type end to end:
--   * widens message.message_type + message_content_presence CHECKs
--   * allows audio MIME types on the private message-attachments bucket
--   * send_message accepts p_message_type = 'audio', auto-classifies an
--     audio-first attachment, persists message_attachment.duration_seconds
--     (a column that has existed since the messaging schema was created but
--     was never written), and writes a '[Voice message]' inbox preview.
--
-- Forward-only: widening a CHECK / a bucket's allowed_mime_types is safe —
-- every existing row still satisfies it. No new table, no new RLS: audio
-- objects live at <conversationId>/<uuid>.m4a, so the existing
-- participant-scoped storage.objects policies and send_message's
-- `storage_path like p_conversation_id || '/%'` prefix check already cover
-- them. 'video' is deliberately left out of the CHECK for now but the
-- shape is ready for it.

-- ── CHECK constraints ────────────────────────────────────────────────
alter table public.message
  drop constraint if exists message_message_type_check;
alter table public.message
  add constraint message_message_type_check
  check (message_type in ('text','image','file','audio','system'));

alter table public.message
  drop constraint if exists message_content_presence;
alter table public.message
  add constraint message_content_presence check (
       message_type = 'system'
    or deleted_at is not null
    or (content is not null and char_length(btrim(content)) > 0)
    or message_type in ('image','file','audio')
  );

-- ── Storage: allow audio uploads on the private attachments bucket ────
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct m order by m)
  from unnest(
    coalesce(allowed_mime_types, array[]::text[])
    || array[
      'audio/mp4','audio/m4a','audio/x-m4a','audio/aac',
      'audio/mpeg','audio/webm','audio/wav'
    ]
  ) as m
)
where id = 'message-attachments';

-- ── send_message: 'audio' type + duration_seconds persistence ────────
create or replace function public.send_message(
  p_conversation_id uuid,
  p_content text default null,
  p_client_generated_id uuid default null,
  p_reply_to_message_id uuid default null,
  p_message_type text default 'text',
  p_attachments jsonb default '[]'::jsonb
)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_caller   uuid := auth.uid();
  v_content  text := nullif(btrim(p_content), '');
  v_status   text;
  v_mod      text;
  v_att      jsonb;
  v_recent   integer;
  v_msg_id   uuid;
begin
  if v_caller is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.conversation_participant
    where conversation_id = p_conversation_id and user_id = v_caller and left_at is null
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_message_type not in ('text','image','file','audio') then
    raise exception 'Unsupported message type' using errcode = 'check_violation';
  end if;

  -- A text-typed message that actually carries files is re-typed from its
  -- first attachment so it satisfies message_content_presence.
  if p_message_type = 'text' and coalesce(jsonb_array_length(p_attachments), 0) > 0 then
    if coalesce(p_attachments->0->>'mime_type', '') like 'audio/%' then
      p_message_type := 'audio';
    elsif coalesce(p_attachments->0->>'mime_type', '') like 'image/%' then
      p_message_type := 'image';
    else
      p_message_type := 'file';
    end if;
  end if;

  select status, moderation_state into v_status, v_mod
    from public.conversation where id = p_conversation_id for update;
  if v_status = 'closed' then
    raise exception 'This conversation is closed.' using errcode = 'check_violation';
  end if;
  if v_mod <> 'visible' then
    raise exception 'This conversation is unavailable.' using errcode = 'check_violation';
  end if;

  -- Block enforcement: no send if a block exists in either direction
  -- between the caller and any other current participant (global or
  -- scoped to this conversation).
  if exists (
    select 1
    from public.conversation_participant cp
    join public.conversation_block b
      on (   (b.blocker_id = v_caller and b.blocked_id = cp.user_id)
          or (b.blocker_id = cp.user_id and b.blocked_id = v_caller))
     and (b.conversation_id is null or b.conversation_id = p_conversation_id)
    where cp.conversation_id = p_conversation_id
      and cp.user_id <> v_caller
      and cp.left_at is null
  ) then
    raise exception 'Messaging is unavailable in this conversation.' using errcode = 'check_violation';
  end if;

  if v_content is null and coalesce(jsonb_array_length(p_attachments), 0) = 0 then
    raise exception 'Message cannot be empty.' using errcode = 'check_violation';
  end if;
  if v_content is not null and char_length(v_content) > 4000 then
    raise exception 'Message is too long.' using errcode = 'check_violation';
  end if;

  if p_reply_to_message_id is not null and not exists (
    select 1 from public.message
    where id = p_reply_to_message_id and conversation_id = p_conversation_id
  ) then
    raise exception 'The message being replied to was not found.' using errcode = 'check_violation';
  end if;

  -- Rate limit: 30 / minute and 500 / hour per sender (their own rows).
  select count(*) into v_recent
    from public.message
    where sender_id = v_caller and created_at > now() - interval '1 minute';
  if v_recent >= 30 then
    raise exception 'You are sending messages too quickly. Please slow down.'
      using errcode = 'check_violation';
  end if;
  select count(*) into v_recent
    from public.message
    where sender_id = v_caller and created_at > now() - interval '1 hour';
  if v_recent >= 500 then
    raise exception 'You have sent a lot of messages recently. Please try again later.'
      using errcode = 'check_violation';
  end if;

  -- Insert (idempotent on the optimistic client id).
  begin
    insert into public.message (
      conversation_id, sender_id, message_type, content,
      reply_to_message_id, client_generated_id
    )
    values (
      p_conversation_id, v_caller, p_message_type, v_content,
      p_reply_to_message_id, p_client_generated_id
    )
    returning id into v_msg_id;
  exception when unique_violation then
    select id into v_msg_id from public.message
      where conversation_id = p_conversation_id
        and sender_id = v_caller
        and client_generated_id = p_client_generated_id;
    return v_msg_id;
  end;

  -- Attachments: each must sit under this conversation's storage prefix.
  if coalesce(jsonb_array_length(p_attachments), 0) > 0 then
    for v_att in select * from jsonb_array_elements(p_attachments)
    loop
      if (v_att->>'storage_path') is null
         or (v_att->>'storage_path') not like (p_conversation_id::text || '/%') then
        raise exception 'Attachment path is not valid for this conversation.'
          using errcode = 'check_violation';
      end if;
      insert into public.message_attachment (
        message_id, storage_path, file_name, mime_type, file_size,
        width, height, duration_seconds
      )
      values (
        v_msg_id,
        v_att->>'storage_path',
        v_att->>'file_name',
        v_att->>'mime_type',
        nullif(v_att->>'file_size','')::integer,
        nullif(v_att->>'width','')::integer,
        nullif(v_att->>'height','')::integer,
        nullif(v_att->>'duration_seconds','')::numeric
      );
    end loop;
  end if;

  update public.conversation
    set last_message_at = now(),
        last_message_preview = left(
          coalesce(
            v_content,
            case
              when p_message_type = 'image' then '[Photo]'
              when p_message_type = 'audio' then '[Voice message]'
              else '[Attachment]'
            end
          ), 140),
        last_message_sender_id = v_caller,
        updated_at = now()
    where id = p_conversation_id;

  -- The sender has implicitly read up to their own message.
  update public.conversation_participant
    set last_read_at = now()
    where conversation_id = p_conversation_id and user_id = v_caller;

  return v_msg_id;
end;
$$;

revoke execute on function public.send_message(uuid, text, uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.send_message(uuid, text, uuid, uuid, text, jsonb) to authenticated, service_role;
