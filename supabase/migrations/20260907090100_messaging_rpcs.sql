-- In-app messaging — Phase 1 (write RPCs).
--
-- Every messaging mutation lives here as a SECURITY DEFINER function that
-- resolves the caller from auth.uid() and never trusts a client-supplied
-- identity. conversation / message / conversation_participant have no
-- client INSERT/UPDATE/DELETE grants (see 20260907090000) so these are the
-- only write path. Same model as create_ticket_checkout / issue_free_ticket.
--
-- Rate limiting follows the codebase's established "count rows in your own
-- table over the last window" style (submitReportCore, phoneAuthCore)
-- rather than the consume_rate_limit primitive, which is reserved for
-- endpoints with no domain table to count against.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

-- ============================================================
-- open_conversation — deterministic get-or-create.
-- Returns the conversation id for (caller, subject); creates it + both
-- participants + the "conversation started" system message on first call.
-- Tapping "Chat" repeatedly always returns the same row.
-- ============================================================
create function public.open_conversation(
  p_type text,
  p_event_id uuid default null,
  p_place_id uuid default null
)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_caller       uuid := auth.uid();
  v_conv_id      uuid;
  v_target_id    uuid;
  v_target_role  text;
  v_title        text;
  v_status       text;
  v_recent       integer;
begin
  if v_caller is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_type not in ('event','place','support') then
    raise exception 'Unsupported conversation type' using errcode = 'check_violation';
  end if;

  -- ---- resolve the business side + dedupe target ----
  if p_type = 'event' then
    if p_event_id is null then
      raise exception 'An event is required' using errcode = 'check_violation';
    end if;
    select organizer_id, title, status
      into v_target_id, v_title, v_status
      from public.event where id = p_event_id;
    if not found then
      raise exception 'That event no longer exists' using errcode = 'no_data_found';
    end if;
    if v_status = 'draft' then
      raise exception 'That event is not available' using errcode = 'check_violation';
    end if;
    if v_target_id = v_caller then
      raise exception 'You cannot message your own event' using errcode = 'check_violation';
    end if;
    v_target_role := 'organizer';

    select id into v_conv_id from public.conversation
      where type = 'event' and event_id = p_event_id and created_by = v_caller;

  elsif p_type = 'place' then
    if p_place_id is null then
      raise exception 'A place is required' using errcode = 'check_violation';
    end if;
    select owner_id, name, status
      into v_target_id, v_title, v_status
      from public.place where id = p_place_id;
    if not found then
      raise exception 'That place no longer exists' using errcode = 'no_data_found';
    end if;
    if v_status = 'draft' then
      raise exception 'That place is not available' using errcode = 'check_violation';
    end if;
    if v_target_id = v_caller then
      raise exception 'You cannot message your own place' using errcode = 'check_violation';
    end if;
    v_target_role := 'place_owner';

    select id into v_conv_id from public.conversation
      where type = 'place' and place_id = p_place_id and created_by = v_caller;

  else  -- support
    v_target_id := null;
    v_title := 'Abonten Support';
    select id into v_conv_id from public.conversation
      where type = 'support' and created_by = v_caller and status = 'open';
  end if;

  if v_conv_id is not null then
    return v_conv_id;   -- already exists
  end if;

  -- ---- soft anti-spam: cap brand-new conversations per hour ----
  select count(*) into v_recent
    from public.conversation
    where created_by = v_caller and created_at > now() - interval '1 hour';
  if v_recent >= 20 then
    raise exception 'You have started a lot of conversations recently. Please try again later.'
      using errcode = 'check_violation';
  end if;

  -- ---- create (race-safe: a concurrent create hits the partial unique
  --      index; we swallow it and re-select) ----
  begin
    insert into public.conversation (type, event_id, place_id, created_by, title)
    values (p_type, p_event_id, p_place_id, v_caller, v_title)
    returning id into v_conv_id;
  exception when unique_violation then
    select id into v_conv_id from public.conversation
      where created_by = v_caller
        and type = p_type
        and event_id is not distinct from p_event_id
        and place_id is not distinct from p_place_id
      order by created_at
      limit 1;
    return v_conv_id;
  end;

  insert into public.conversation_participant (conversation_id, user_id, role)
  values (v_conv_id, v_caller, 'member');

  if v_target_id is not null then
    insert into public.conversation_participant (conversation_id, user_id, role)
    values (v_conv_id, v_target_id, v_target_role);
  end if;

  insert into public.message (conversation_id, sender_id, message_type, system_event, system_data)
  values (
    v_conv_id, null, 'system', 'conversation_started',
    jsonb_build_object('initiator_id', v_caller, 'conversation_type', p_type)
  );

  update public.conversation
    set last_message_at = now(),
        last_message_preview = null,
        updated_at = now()
    where id = v_conv_id;

  return v_conv_id;
end;
$$;

revoke execute on function public.open_conversation(text, uuid, uuid) from public, anon;
grant execute on function public.open_conversation(text, uuid, uuid) to authenticated, service_role;

-- ============================================================
-- send_message
-- ============================================================
create function public.send_message(
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

  if p_message_type not in ('text','image','file') then
    raise exception 'Unsupported message type' using errcode = 'check_violation';
  end if;

  -- A text-typed message that actually carries files is re-typed from its
  -- first attachment so it satisfies message_content_presence.
  if p_message_type = 'text' and coalesce(jsonb_array_length(p_attachments), 0) > 0 then
    if coalesce(p_attachments->0->>'mime_type', '') like 'image/%' then
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
        message_id, storage_path, file_name, mime_type, file_size, width, height
      )
      values (
        v_msg_id,
        v_att->>'storage_path',
        v_att->>'file_name',
        v_att->>'mime_type',
        nullif(v_att->>'file_size','')::integer,
        nullif(v_att->>'width','')::integer,
        nullif(v_att->>'height','')::integer
      );
    end loop;
  end if;

  update public.conversation
    set last_message_at = now(),
        last_message_preview = left(
          coalesce(
            v_content,
            case when p_message_type = 'image' then '[Photo]' else '[Attachment]' end
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

-- ============================================================
-- edit_message — own text message, within a 15-minute window
-- (matches the common messenger default; no PRD rule exists in-repo).
-- ============================================================
create function public.edit_message(p_message_id uuid, p_content text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_caller  uuid := auth.uid();
  v_content text := nullif(btrim(p_content), '');
  v_row     public.message%rowtype;
begin
  if v_caller is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_row from public.message where id = p_message_id;
  if not found then
    raise exception 'Message not found' using errcode = 'no_data_found';
  end if;
  if v_row.sender_id is distinct from v_caller then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_row.deleted_at is not null then
    raise exception 'This message was deleted.' using errcode = 'check_violation';
  end if;
  if v_row.message_type <> 'text' then
    raise exception 'Only text messages can be edited.' using errcode = 'check_violation';
  end if;
  if now() - v_row.created_at > interval '15 minutes' then
    raise exception 'The edit window for this message has passed.' using errcode = 'check_violation';
  end if;
  if v_content is null then
    raise exception 'Message cannot be empty.' using errcode = 'check_violation';
  end if;
  if char_length(v_content) > 4000 then
    raise exception 'Message is too long.' using errcode = 'check_violation';
  end if;

  update public.message
    set content = v_content, edited_at = now()
    where id = p_message_id;

  update public.conversation
    set last_message_preview = left(v_content, 140), updated_at = now()
    where id = v_row.conversation_id
      and last_message_at = v_row.created_at
      and last_message_sender_id = v_caller;
end;
$$;

revoke execute on function public.edit_message(uuid, text) from public, anon;
grant execute on function public.edit_message(uuid, text) to authenticated, service_role;

-- ============================================================
-- delete_message — soft delete of own message. Idempotent.
-- ============================================================
create function public.delete_message(p_message_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_row    public.message%rowtype;
  v_prev   public.message%rowtype;
begin
  if v_caller is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_row from public.message where id = p_message_id;
  if not found then
    raise exception 'Message not found' using errcode = 'no_data_found';
  end if;
  if v_row.sender_id is distinct from v_caller then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_row.deleted_at is not null then
    return;  -- already gone
  end if;

  update public.message set deleted_at = now() where id = p_message_id;

  -- If it was the conversation's latest message, roll the preview back to
  -- the previous surviving message.
  select * into v_prev from public.message
    where conversation_id = v_row.conversation_id
      and deleted_at is null
      and id <> p_message_id
    order by created_at desc, id desc
    limit 1;

  update public.conversation
    set last_message_at        = coalesce(v_prev.created_at, v_row.created_at),
        last_message_preview   = case
                                   when v_prev.id is null then null
                                   when v_prev.message_type = 'system' then null
                                   else left(coalesce(v_prev.content, '[Attachment]'), 140)
                                 end,
        last_message_sender_id = v_prev.sender_id,
        updated_at             = now()
    where id = v_row.conversation_id
      and last_message_at = v_row.created_at;
end;
$$;

revoke execute on function public.delete_message(uuid) from public, anon;
grant execute on function public.delete_message(uuid) to authenticated, service_role;

-- ============================================================
-- mark_conversation_read
-- ============================================================
create function public.mark_conversation_read(
  p_conversation_id uuid,
  p_up_to timestamptz default now()
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  update public.conversation_participant
    set last_read_at = greatest(last_read_at, least(coalesce(p_up_to, now()), now()))
    where conversation_id = p_conversation_id and user_id = v_caller;

  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.mark_conversation_read(uuid, timestamptz) from public, anon;
grant execute on function public.mark_conversation_read(uuid, timestamptz) to authenticated, service_role;

-- ============================================================
-- set_conversation_state — mute / archive (per participant)
-- ============================================================
create function public.set_conversation_state(
  p_conversation_id uuid,
  p_muted boolean default null,
  p_archived boolean default null
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  update public.conversation_participant
    set muted    = coalesce(p_muted, muted),
        archived = coalesce(p_archived, archived)
    where conversation_id = p_conversation_id and user_id = v_caller;

  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.set_conversation_state(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_conversation_state(uuid, boolean, boolean) to authenticated, service_role;

-- ============================================================
-- block_participant — block / unblock another participant
-- ============================================================
create function public.block_participant(
  p_conversation_id uuid,
  p_blocked_id uuid,
  p_block boolean default true
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_blocked_id = v_caller then
    raise exception 'You cannot block yourself.' using errcode = 'check_violation';
  end if;
  if not public.is_conversation_participant(p_conversation_id, v_caller) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not public.is_conversation_participant(p_conversation_id, p_blocked_id) then
    raise exception 'That person is not in this conversation.' using errcode = 'check_violation';
  end if;

  if p_block then
    insert into public.conversation_block (blocker_id, blocked_id, conversation_id)
    values (v_caller, p_blocked_id, p_conversation_id)
    on conflict do nothing;
  else
    delete from public.conversation_block
      where blocker_id = v_caller
        and blocked_id = p_blocked_id
        and conversation_id is not distinct from p_conversation_id;
  end if;
end;
$$;

revoke execute on function public.block_participant(uuid, uuid, boolean) from public, anon;
grant execute on function public.block_participant(uuid, uuid, boolean) to authenticated, service_role;

-- ============================================================
-- list_conversations — the inbox query, with per-conversation unread count
-- computed against the caller's last_read_at. Keyset paginated on
-- (last_message_at, id).
-- ============================================================
create function public.list_conversations(
  p_filter text default 'active',      -- 'active' | 'archived' | 'all' | 'unread'
  p_cursor_ts timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
  returns table (
    conversation_id        uuid,
    type                   text,
    event_id               uuid,
    place_id               uuid,
    title                  text,
    status                 text,
    last_message_at        timestamptz,
    last_message_preview   text,
    last_message_sender_id uuid,
    my_role                text,
    my_last_read_at        timestamptz,
    muted                  boolean,
    archived               boolean,
    unread_count           integer,
    other_participant_ids  uuid[],
    created_at             timestamptz
  )
  language sql
  security definer
  set search_path = ''
as $$
  with me as (select auth.uid() as uid)
  select
    c.id,
    c.type,
    c.event_id,
    c.place_id,
    c.title,
    c.status,
    c.last_message_at,
    case when c.moderation_state = 'visible' then c.last_message_preview else null end,
    c.last_message_sender_id,
    cp.role,
    cp.last_read_at,
    cp.muted,
    cp.archived,
    (
      select count(*)::integer
      from public.message m
      where m.conversation_id = c.id
        and m.deleted_at is null
        and m.moderation_state = 'visible'
        and m.message_type <> 'system'
        and m.sender_id is distinct from (select uid from me)
        and m.created_at > cp.last_read_at
    ) as unread_count,
    (
      select coalesce(array_agg(op.user_id), '{}')
      from public.conversation_participant op
      where op.conversation_id = c.id
        and op.user_id <> (select uid from me)
        and op.left_at is null
    ) as other_participant_ids,
    c.created_at
  from public.conversation c
  join public.conversation_participant cp
    on cp.conversation_id = c.id
   and cp.user_id = (select uid from me)
   and cp.left_at is null
  where c.moderation_state <> 'removed'
    and (
      p_filter = 'all'
      or (p_filter = 'active'   and cp.archived = false)
      or (p_filter = 'archived' and cp.archived = true)
      or (p_filter = 'unread'   and cp.archived = false)
    )
    and (
      p_cursor_ts is null
      or c.last_message_at < p_cursor_ts
      or (c.last_message_at = p_cursor_ts and c.id < p_cursor_id)
    )
  order by c.last_message_at desc nulls last, c.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke execute on function public.list_conversations(text, timestamptz, uuid, integer) from public, anon;
grant execute on function public.list_conversations(text, timestamptz, uuid, integer) to authenticated, service_role;

-- ============================================================
-- get_unread_conversation_count — badge source. Counts non-archived
-- conversations with >= 1 unread message (muted still counts, matching
-- common messenger behaviour — mute only suppresses push).
-- ============================================================
create function public.get_unread_conversation_count()
  returns integer
  language sql
  security definer
  set search_path = ''
as $$
  with me as (select auth.uid() as uid)
  select count(*)::integer
  from public.conversation c
  join public.conversation_participant cp
    on cp.conversation_id = c.id
   and cp.user_id = (select uid from me)
   and cp.left_at is null
   and cp.archived = false
  where c.moderation_state <> 'removed'
    and exists (
      select 1 from public.message m
      where m.conversation_id = c.id
        and m.deleted_at is null
        and m.moderation_state = 'visible'
        and m.message_type <> 'system'
        and m.sender_id is distinct from (select uid from me)
        and m.created_at > cp.last_read_at
    );
$$;

revoke execute on function public.get_unread_conversation_count() from public, anon;
grant execute on function public.get_unread_conversation_count() to authenticated, service_role;
