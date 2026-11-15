-- Team accounts, stage 4: messages and review replies as a team
-- (Tickets, entry and teams plan, Part 2; docs/architecture/team-accounts.md
-- §4c; decision X7).
--
-- Members whose role covers `messages.reply` (Owners, Content and messages)
-- read and answer the team's conversations: the team's inbox, its unread
-- count, its read state, mute/archive, blocks, reactions and edits. A
-- message they send is the team's (sender_id = the team): customers see
-- the team's name only (X7). Which member wrote it is kept in
-- message_team_sender, readable by nobody but the server.
--
-- Members whose role covers `reviews.reply` (Owners, Content and messages)
-- answer reviews of the team's events and places. Nobody reviews, or
-- messages as a customer, an event or a place of a team they belong to.
--
-- Nothing here is reachable until a team exists; teams ship switched off.

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------

-- Whether a person is an active member of an (active or paused) team.
create or replace function public.is_team_member(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_member m
    where m.team_id = p_team_id
      and m.user_id = p_user_id
      and m.status = 'active'
  );
$$;

revoke all on function public.is_team_member(uuid, uuid) from public, anon;
grant execute on function public.is_team_member(uuid, uuid) to authenticated, service_role;

-- Who the signed-in person speaks as in a conversation: themselves when
-- they take part in it, else the team taking part that they answer for
-- (messages.reply), else themselves (and the caller's own checks refuse).
create or replace function public.messaging_actor(p_conversation_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select auth.uid()
      where exists (
        select 1 from public.conversation_participant cp
        where cp.conversation_id = p_conversation_id
          and cp.user_id = auth.uid()
          and cp.left_at is null
      )
    ),
    (
      select cp.user_id
      from public.conversation_participant cp
      join public.team t on t.account_id = cp.user_id
      where cp.conversation_id = p_conversation_id
        and cp.left_at is null
        and cp.user_id = any ((select public.acting_accounts(array['messages.reply']))::uuid[])
      order by cp.joined_at
      limit 1
    ),
    auth.uid()
  );
$$;

revoke all on function public.messaging_actor(uuid) from public, anon;
grant execute on function public.messaging_actor(uuid) to authenticated, service_role;

-- Taking part: the person themselves, or (for the signed-in person) a team
-- in the conversation they answer for. Every messaging read rule, the
-- conversation's realtime channel and its attachments go through this.
create or replace function public.is_conversation_participant(
  p_conversation_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_participant cp
    where cp.conversation_id = p_conversation_id
      and cp.left_at is null
      and (
        cp.user_id = p_user_id
        or (
          p_user_id = auth.uid()
          and cp.user_id = any ((select public.acting_accounts(array['messages.reply']))::uuid[])
        )
      )
  );
$$;

-- Which member wrote a message sent as the team. Server-only: no client
-- may read it, so a customer never learns who answered (X7).
create table if not exists public.message_team_sender (
  message_id uuid primary key references public.message(id) on delete cascade,
  team_id uuid not null references public.team(account_id) on delete cascade,
  member_id uuid references public.user_info(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.message_team_sender enable row level security;
revoke all on table public.message_team_sender from anon, authenticated;
grant all on table public.message_team_sender to service_role;

-- ---------------------------------------------------------------------------
-- 2. The messaging and review functions act for the team
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.block_participant(p_conversation_id uuid, p_blocked_id uuid, p_block boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller uuid := public.messaging_actor(p_conversation_id);
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
$function$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid, p_up_to timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller uuid := public.messaging_actor(p_conversation_id);
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
$function$;

CREATE OR REPLACE FUNCTION public.set_conversation_state(p_conversation_id uuid, p_muted boolean DEFAULT NULL::boolean, p_archived boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller uuid := public.messaging_actor(p_conversation_id);
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
$function$;

CREATE OR REPLACE FUNCTION public.mark_conversation_unread(p_conversation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller uuid := public.messaging_actor(p_conversation_id);
  v_ts     timestamptz;
begin
  if v_caller is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.conversation_participant
    where conversation_id = p_conversation_id
      and user_id = v_caller
      and left_at is null
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- The newest message that could count as "unread" for this caller.
  select max(m.created_at) into v_ts
  from public.message m
  where m.conversation_id = p_conversation_id
    and m.deleted_at is null
    and m.moderation_state = 'visible'
    and m.message_type <> 'system'
    and m.sender_id is distinct from v_caller;

  if v_ts is null then
    return;  -- nothing inbound — cannot be unread
  end if;

  update public.conversation_participant
    set last_read_at = v_ts - interval '1 millisecond'
    where conversation_id = p_conversation_id and user_id = v_caller;
end;
$function$;

CREATE OR REPLACE FUNCTION public.send_message(p_conversation_id uuid, p_content text DEFAULT NULL::text, p_client_generated_id uuid DEFAULT NULL::uuid, p_reply_to_message_id uuid DEFAULT NULL::uuid, p_message_type text DEFAULT 'text'::text, p_attachments jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller   uuid := public.messaging_actor(p_conversation_id);
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

  if v_caller is distinct from auth.uid() then
    insert into public.message_team_sender (message_id, team_id, member_id)
    values (v_msg_id, v_caller, auth.uid())
    on conflict (message_id) do nothing;
  end if;

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
$function$;

CREATE OR REPLACE FUNCTION public.toggle_message_reaction(p_message_id uuid, p_emoji text)
 RETURNS TABLE(added boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller  uuid := public.messaging_actor(
    (select m.conversation_id from public.message m where m.id = p_message_id)
  );
  v_conv_id uuid;
  v_deleted timestamptz;
  v_current text;
  v_above_latin1 text := '[^' || chr(1) || '-' || chr(255) || ']';
begin
  if v_caller is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Same shape rules as message_reaction_emoji_shape and as
  -- isValidReactionEmoji() in @abonten/core; checked here too so the caller
  -- gets a clean 409 instead of a raw constraint error.
  if p_emoji is null
     or char_length(p_emoji) not between 1 and 16
     or p_emoji ~ '[A-Za-z]'
     or p_emoji ~ '[[:space:]]'
     or p_emoji !~ v_above_latin1
  then
    raise exception 'Unsupported reaction' using errcode = 'check_violation';
  end if;

  select conversation_id, deleted_at
    into v_conv_id, v_deleted
    from public.message
    where id = p_message_id;
  if not found then
    raise exception 'Message not found' using errcode = 'no_data_found';
  end if;
  if v_deleted is not null then
    raise exception 'That message is gone' using errcode = 'check_violation';
  end if;
  if not public.is_conversation_participant(v_conv_id, v_caller) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select emoji into v_current
    from public.message_reaction
    where message_id = p_message_id and user_id = v_caller;

  -- Tapping the emoji you already have removes it.
  if v_current is not null and v_current = p_emoji then
    delete from public.message_reaction
      where message_id = p_message_id and user_id = v_caller;
    added := false;
    return next;
    return;
  end if;

  -- Otherwise add it, replacing any other emoji from this user.
  insert into public.message_reaction (message_id, user_id, emoji, conversation_id)
    values (p_message_id, v_caller, p_emoji, v_conv_id)
    on conflict (message_id, user_id)
    do update set emoji = excluded.emoji, created_at = now();

  added := true;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.edit_message(p_message_id uuid, p_content text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller  uuid := public.messaging_actor(
    (select m.conversation_id from public.message m where m.id = p_message_id)
  );
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
$function$;

CREATE OR REPLACE FUNCTION public.delete_message(p_message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller uuid := public.messaging_actor(
    (select m.conversation_id from public.message m where m.id = p_message_id)
  );
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
$function$;

drop function public.list_conversations(p_filter text, p_cursor_ts timestamp with time zone, p_cursor_id uuid, p_limit integer, p_role_scope text, p_search text, p_type text, p_muted boolean);
CREATE OR REPLACE FUNCTION public.list_conversations(p_filter text DEFAULT 'active'::text, p_cursor_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_role_scope text DEFAULT 'all'::text, p_search text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_muted boolean DEFAULT NULL::boolean, p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(conversation_id uuid, type text, event_id uuid, place_id uuid, title text, status text, last_message_at timestamp with time zone, last_message_preview text, last_message_sender_id uuid, my_role text, my_last_read_at timestamp with time zone, muted boolean, archived boolean, unread_count integer, other_participant_ids uuid[], created_at timestamp with time zone, subject_title text, other_user_id uuid, other_display_name text, other_username text, other_avatar_public_id text, other_avatar_version text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (select public.acting_account_for(p_account, array['messages.reply']) as uid),
  q as (
    -- The typed text as search compares it (folded), ready for LIKE.
    select '%' || public._search_like_escape(public._search_normalize(p_search)) || '%' as pat
  )
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
    c.created_at,
    coalesce(
      case
        when c.type = 'event' then ev.title
        when c.type = 'place' then pl.name
        else c.title
      end,
      c.title
    ) as subject_title,
    other.user_id           as other_user_id,
    other.full_name         as other_display_name,
    other.username          as other_username,
    other.avatar_public_id  as other_avatar_public_id,
    other.avatar_version    as other_avatar_version
  from public.conversation c
  join public.conversation_participant cp
    on cp.conversation_id = c.id
   and cp.user_id = (select uid from me)
   and cp.left_at is null
  left join public.event ev on ev.id = c.event_id
  left join public.place pl on pl.id = c.place_id
  left join lateral (
    select op.user_id, ui.full_name, ui.username, ui.search_name,
           ui.avatar_public_id, ui.avatar_version
    from public.conversation_participant op
    join public.user_info ui on ui.id = op.user_id
    where op.conversation_id = c.id
      and op.user_id <> (select uid from me)
      and op.left_at is null
    order by case op.role
      when 'organizer'  then 0
      when 'place_owner' then 1
      when 'staff'      then 2
      when 'admin'      then 3
      else 4
    end
    limit 1
  ) other on true
  where c.moderation_state not in ('removed','hidden','restricted')
    and (
      p_filter = 'all'
      or (p_filter = 'active'   and cp.archived = false)
      or (p_filter = 'archived' and cp.archived = true)
      or (p_filter = 'unread'   and cp.archived = false)
    )
    and (
      p_role_scope is null
      or p_role_scope = 'all'
      or (p_role_scope = 'member'   and cp.role = 'member')
      or (p_role_scope = 'business' and cp.role in ('organizer','place_owner','staff','admin'))
    )
    and (p_type is null or c.type = p_type)
    and (p_muted is null or cp.muted = p_muted)
    and (
      p_search is null
      or btrim(p_search) = ''
      or public._search_fold(c.title)  like (select pat from q) escape '\'
      or ev.search_title               like (select pat from q) escape '\'
      or pl.search_name                like (select pat from q) escape '\'
      or other.search_name             like (select pat from q) escape '\'
      or lower(other.username::text)   like (select pat from q) escape '\'
    )
    and (
      p_cursor_ts is null
      or c.last_message_at < p_cursor_ts
      or (c.last_message_at = p_cursor_ts and c.id < p_cursor_id)
    )
  order by c.last_message_at desc nulls last, c.id desc
  limit least(greatest(p_limit, 1), 50);
$function$;

revoke all on function public.list_conversations(p_filter text, p_cursor_ts timestamp with time zone, p_cursor_id uuid, p_limit integer, p_role_scope text, p_search text, p_type text, p_muted boolean, uuid) from public, anon;
grant execute on function public.list_conversations(p_filter text, p_cursor_ts timestamp with time zone, p_cursor_id uuid, p_limit integer, p_role_scope text, p_search text, p_type text, p_muted boolean, uuid) to authenticated, service_role;

drop function public.get_unread_conversation_count();
CREATE OR REPLACE FUNCTION public.get_unread_conversation_count(p_account uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (select public.acting_account_for(p_account, array['messages.reply']) as uid)
  select count(*)::integer
  from public.conversation c
  join public.conversation_participant cp
    on cp.conversation_id = c.id
   and cp.user_id = (select uid from me)
   and cp.left_at is null
   and cp.archived = false
  where c.moderation_state not in ('removed','hidden','restricted')
    and exists (
      select 1 from public.message m
      where m.conversation_id = c.id
        and m.deleted_at is null
        and m.moderation_state = 'visible'
        and m.message_type <> 'system'
        and m.sender_id is distinct from (select uid from me)
        and m.created_at > cp.last_read_at
    );
$function$;

revoke all on function public.get_unread_conversation_count(uuid) from public, anon;
grant execute on function public.get_unread_conversation_count(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.open_conversation(p_type text, p_event_id uuid DEFAULT NULL::uuid, p_place_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    if v_target_id = v_caller or public.is_team_member(v_target_id, v_caller) then
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
    if v_target_id = v_caller or public.is_team_member(v_target_id, v_caller) then
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
$function$;

CREATE OR REPLACE FUNCTION public.protect_event_review_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_is_reviewer boolean := (select auth.uid()) = old.reviewer_id;
  v_is_organizer boolean := exists (
    select 1 from public.event e where e.id = old.event_id
      and e.organizer_id = any ((select public.acting_accounts(array['reviews.reply']))::uuid[])
  );
begin
  if (select auth.uid()) is not null
     and pg_trigger_depth() <= 1
     and new.helpful_count is distinct from old.helpful_count then
    raise exception 'Not authorized to modify this field on this review'
      using errcode = '42501';
  end if;

  if v_is_reviewer and not v_is_organizer then
    if new.organizer_response is distinct from old.organizer_response
       or new.organizer_response_at is distinct from old.organizer_response_at
       or new.status is distinct from old.status
       or new.event_id is distinct from old.event_id
       or new.reviewer_id is distinct from old.reviewer_id then
      raise exception 'Not authorized to modify this field on your review';
    end if;
    return new;
  end if;

  if v_is_organizer and not v_is_reviewer then
    if new.rating is distinct from old.rating
       or new.title is distinct from old.title
       or new.comment is distinct from old.comment
       or new.status is distinct from old.status
       or new.event_id is distinct from old.event_id
       or new.reviewer_id is distinct from old.reviewer_id
       or new.is_verified_attendee is distinct from old.is_verified_attendee then
      raise exception 'Not authorized to modify this field on this review';
    end if;
    return new;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.protect_place_review_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_is_reviewer boolean := (select auth.uid()) = old.reviewer_id;
  v_is_owner boolean := exists (
    select 1 from public.place p where p.id = old.place_id
      and p.owner_id = any ((select public.acting_accounts(array['reviews.reply']))::uuid[])
  );
begin
  if (select auth.uid()) is not null
     and pg_trigger_depth() <= 1
     and new.helpful_count is distinct from old.helpful_count then
    raise exception 'Not authorized to modify this field on this review'
      using errcode = '42501';
  end if;

  if v_is_reviewer and not v_is_owner then
    if new.owner_response is distinct from old.owner_response
       or new.owner_response_at is distinct from old.owner_response_at
       or new.status is distinct from old.status
       or new.place_id is distinct from old.place_id
       or new.reviewer_id is distinct from old.reviewer_id then
      raise exception 'Not authorized to modify this field on your review';
    end if;
    return new;
  end if;

  if v_is_owner and not v_is_reviewer then
    if new.rating is distinct from old.rating
       or new.title is distinct from old.title
       or new.comment is distinct from old.comment
       or new.status is distinct from old.status
       or new.place_id is distinct from old.place_id
       or new.reviewer_id is distinct from old.reviewer_id then
      raise exception 'Not authorized to modify this field on this review';
    end if;
    return new;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_event_review_eligibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller uuid := auth.uid();
  v_organizer uuid;
  v_status text;
  v_ends timestamptz;
  v_end timestamptz;
  v_occ_count integer;
begin
  -- service_role / SQL maintenance runs without a JWT and stays trusted.
  if v_caller is null then
    return new;
  end if;

  if new.reviewer_id is distinct from v_caller then
    raise exception 'You can only post your own review'
      using errcode = '42501';
  end if;

  select e.organizer_id, e.status, e.ends_at
    into v_organizer, v_status, v_ends
  from public.event e
  where e.id = new.event_id;

  if not found then
    raise exception 'No event found!' using errcode = 'no_data_found';
  end if;

  if v_organizer = v_caller or public.is_team_member(v_organizer, v_caller) then
    raise exception 'You cannot review your own event'
      using errcode = 'check_violation';
  end if;

  if v_status = 'canceled' then
    raise exception 'This event was cancelled.'
      using errcode = 'check_violation';
  end if;

  -- Same end date resolveEventEndDate() computes: the last occurrence when
  -- the event has any, otherwise the single ends_at.
  select count(*) into v_occ_count
  from public.event_occurrence
  where event_id = new.event_id;

  if v_occ_count > 0 then
    select max(o.ends_at) into v_end
    from public.event_occurrence o
    where o.event_id = new.event_id;
  else
    v_end := v_ends;
  end if;

  if v_end is null or now() < v_end then
    raise exception 'You can only review this event after it has ended.'
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1
    from public.ticket t
    join public.ticket_type tt on tt.id = t.ticket_type_id
    where t.user_id = v_caller
      and tt.event_id = new.event_id
      and t.status = 'used'
  ) then
    raise exception 'You can only review events you have attended'
      using errcode = 'check_violation';
  end if;

  -- The badge is a claim about attendance, so the database decides it
  -- rather than believing the client.
  new.is_verified_attendee := true;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_place_review_not_own_place()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Service role and maintenance run without a JWT and stay trusted.
  if (select auth.uid()) is null then
    return new;
  end if;
  if exists (
    select 1 from public.place p
    where p.id = new.place_id
      and (p.owner_id = new.reviewer_id or public.is_team_member(p.owner_id, new.reviewer_id))
  ) then
    raise exception 'You cannot review your own place'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Rules
-- ---------------------------------------------------------------------------

-- The team's inbox channel: members who answer its messages may listen.
drop policy if exists messaging_realtime_inbox_read on realtime.messages;
create policy messaging_realtime_inbox_read on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and realtime.topic() ~ '^inbox:[0-9a-fA-F-]{36}$'
    and substring(realtime.topic(), '^inbox:(.+)$')::uuid
      = any ((select public.acting_accounts(array['messages.reply']))::uuid[])
  );

-- Replies to reviews of the team's events and places.
alter policy event_review_update on public.event_review
  using (
    exists (
      select 1 from public.event e
      where e.id = event_review.event_id
        and e.organizer_id = any ((select public.acting_accounts(array['reviews.reply']))::uuid[])
    )
    or (select auth.uid()) = reviewer_id
  )
  with check (
    exists (
      select 1 from public.event e
      where e.id = event_review.event_id
        and e.organizer_id = any ((select public.acting_accounts(array['reviews.reply']))::uuid[])
    )
    or (select auth.uid()) = reviewer_id
  );

alter policy place_review_update on public.place_review
  using (
    exists (
      select 1 from public.place p
      where p.id = place_review.place_id
        and p.owner_id = any ((select public.acting_accounts(array['reviews.reply']))::uuid[])
    )
    or (select auth.uid()) = reviewer_id
  )
  with check (
    exists (
      select 1 from public.place p
      where p.id = place_review.place_id
        and p.owner_id = any ((select public.acting_accounts(array['reviews.reply']))::uuid[])
    )
    or (select auth.uid()) = reviewer_id
  );

-- ---------------------------------------------------------------------------
-- 4. Checks
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'send_message', 'mark_conversation_read', 'mark_conversation_unread',
        'set_conversation_state', 'block_participant', 'toggle_message_reaction',
        'edit_message', 'delete_message'
      )
      and p.prosrc !~ 'messaging_actor'
  ) then
    raise exception 'migration check: a messaging function still speaks only as the caller';
  end if;
  if has_table_privilege('authenticated', 'public.message_team_sender', 'select') then
    raise exception 'migration check: message_team_sender must be server-only';
  end if;
  if has_function_privilege('anon', 'public.list_conversations(text, timestamp with time zone, uuid, integer, text, text, text, boolean, uuid)', 'execute') then
    raise exception 'migration check: anon may list conversations';
  end if;
  if (select enabled from public.team_program_setting where id = 1) then
    raise exception 'migration check: teams must ship switched off';
  end if;
end;
$$;
