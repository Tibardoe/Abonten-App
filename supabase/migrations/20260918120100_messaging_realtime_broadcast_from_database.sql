-- Messaging realtime: database changes are BROADCAST from triggers on
-- private channels, instead of streamed to clients as postgres_changes.
-- (Deferred item F9 of the 2026-09-18 audit, docs/audit/04.)
--
-- WHY. postgres_changes delivers a table change by evaluating the table's
-- RLS once per subscriber per change on the Realtime server. With one
-- `msgchanges:<id>` subscription per open thread and one inbox subscription
-- per signed-in user, that cost grows with (open threads x changes) and is
-- the documented scaling ceiling of postgres_changes. A trigger that calls
-- realtime.send() writes each event once, to the one topic that needs it,
-- and Realtime's authorization for that topic is evaluated once per JOIN,
-- not once per message.
--
-- TOPICS (both private, both authorised by RLS on realtime.messages):
--   conversation:<id>  -- existing channel (typing + presence), participant
--                         only (20260907091000). Now also carries:
--       message_insert      {id, conversation_id, sender_id, message_type, created_at}
--       message_update      {id, conversation_id}           -- edit, delete, moderation
--       reaction            {eventType, new, old}           -- same shape the shared
--                                                             reducer already parses
--       participant_update  {conversation_id, user_id, last_read_at, left_at}
--   inbox:<user id>    -- NEW, readable only by that user (policy below).
--       conversation_update {id, last_message_at, last_message_preview,
--                            last_message_sender_id, status}
--       conversation_added / conversation_removed / conversation_state
--                           {id}   -- client refetches its inbox
--
-- WHAT IS NOT BROADCAST. Message bodies. The thread only needs to know that
-- something changed (it refetches through RLS, which also drops anything
-- moderated away); the inbox preview is the same 140-character
-- `last_message_preview` column participants can already read. A
-- participant's own mute / archive state goes only to their own inbox topic.
--
-- DELIVERY SEMANTICS. realtime.send() inserts into realtime.messages inside
-- the current transaction, so an event is delivered only if the change
-- commits; a rolled-back send_message broadcasts nothing. It never raises
-- (Realtime catches and warns), so a broadcast failure cannot fail a write.
--
-- ROLLOUT. Additive: postgres_changes keeps working for clients that have not
-- updated yet. The four tables leave the supabase_realtime publication in a
-- follow-up migration once web is deployed and the mobile update has shipped.

-- The per-user inbox topic ------------------------------------------------
-- `realtime.topic()` is the topic the socket joined; comparing it as text to
-- the caller's own id means no cast can fail inside the predicate.
create policy messaging_realtime_inbox_read
  on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and realtime.topic() = 'inbox:' || (select auth.uid())::text
  );

-- message ------------------------------------------------------------------
create or replace function public.messaging_broadcast_message()
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
        'conversation_id', new.conversation_id,
        'sender_id', new.sender_id,
        'message_type', new.message_type,
        'created_at', new.created_at
      ),
      'message_insert',
      'conversation:' || new.conversation_id::text,
      true
    );
  else
    perform realtime.send(
      jsonb_build_object('id', new.id, 'conversation_id', new.conversation_id),
      'message_update',
      'conversation:' || new.conversation_id::text,
      true
    );
  end if;
  return null;
end;
$$;

revoke execute on function public.messaging_broadcast_message() from public, anon, authenticated;

drop trigger if exists trg_messaging_broadcast_message_insert on public.message;
create trigger trg_messaging_broadcast_message_insert
  after insert on public.message
  for each row execute function public.messaging_broadcast_message();

drop trigger if exists trg_messaging_broadcast_message_update on public.message;
create trigger trg_messaging_broadcast_message_update
  after update on public.message
  for each row
  when (old.* is distinct from new.*)
  execute function public.messaging_broadcast_message();

-- message_reaction ---------------------------------------------------------
-- Payload mirrors the postgres_changes shape ({eventType, new, old}) so the
-- shared, unit-tested reducer (@abonten/core/messagingReactions) is reused
-- unchanged by both apps.
create or replace function public.messaging_broadcast_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation uuid := coalesce(new.conversation_id, old.conversation_id);
begin
  if v_conversation is null then
    return null;
  end if;
  perform realtime.send(
    jsonb_build_object(
      'eventType', tg_op,
      'new', case when tg_op = 'DELETE' then '{}'::jsonb else jsonb_build_object(
        'message_id', new.message_id, 'user_id', new.user_id, 'emoji', new.emoji) end,
      'old', case when tg_op = 'INSERT' then '{}'::jsonb else jsonb_build_object(
        'message_id', old.message_id, 'user_id', old.user_id, 'emoji', old.emoji) end
    ),
    'reaction',
    'conversation:' || v_conversation::text,
    true
  );
  return null;
end;
$$;

revoke execute on function public.messaging_broadcast_reaction() from public, anon, authenticated;

drop trigger if exists trg_messaging_broadcast_reaction on public.message_reaction;
create trigger trg_messaging_broadcast_reaction
  after insert or update or delete on public.message_reaction
  for each row execute function public.messaging_broadcast_reaction();

-- conversation -> each current participant's inbox -------------------------
create or replace function public.messaging_broadcast_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.last_message_at is not distinct from old.last_message_at
     and new.last_message_preview is not distinct from old.last_message_preview
     and new.last_message_sender_id is not distinct from old.last_message_sender_id
     and new.status is not distinct from old.status then
    return null;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'last_message_at', new.last_message_at,
      'last_message_preview', new.last_message_preview,
      'last_message_sender_id', new.last_message_sender_id,
      'status', new.status
    ),
    'conversation_update',
    'inbox:' || cp.user_id::text,
    true
  )
  from public.conversation_participant cp
  where cp.conversation_id = new.id
    and cp.left_at is null;

  return null;
end;
$$;

revoke execute on function public.messaging_broadcast_conversation() from public, anon, authenticated;

drop trigger if exists trg_messaging_broadcast_conversation on public.conversation;
create trigger trg_messaging_broadcast_conversation
  after update on public.conversation
  for each row execute function public.messaging_broadcast_conversation();

-- conversation_participant --------------------------------------------------
--   INSERT            -> the new participant's inbox: conversation_added
--   DELETE            -> that participant's inbox: conversation_removed
--   UPDATE last_read_at / left_at -> the thread: participant_update
--                        (read receipts; someone left)
--   UPDATE of the row at all      -> the owner's inbox: conversation_state
--                        (their other devices refresh unread / mute / archive)
create or replace function public.messaging_broadcast_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform realtime.send(
      jsonb_build_object('id', new.conversation_id),
      'conversation_added',
      'inbox:' || new.user_id::text,
      true
    );
    return null;
  end if;

  if tg_op = 'DELETE' then
    perform realtime.send(
      jsonb_build_object('id', old.conversation_id),
      'conversation_removed',
      'inbox:' || old.user_id::text,
      true
    );
    return null;
  end if;

  if new.last_read_at is distinct from old.last_read_at
     or new.left_at is distinct from old.left_at then
    perform realtime.send(
      jsonb_build_object(
        'conversation_id', new.conversation_id,
        'user_id', new.user_id,
        'last_read_at', new.last_read_at,
        'left_at', new.left_at
      ),
      'participant_update',
      'conversation:' || new.conversation_id::text,
      true
    );
  end if;

  perform realtime.send(
    jsonb_build_object('id', new.conversation_id),
    'conversation_state',
    'inbox:' || new.user_id::text,
    true
  );
  return null;
end;
$$;

revoke execute on function public.messaging_broadcast_participant() from public, anon, authenticated;

drop trigger if exists trg_messaging_broadcast_participant on public.conversation_participant;
create trigger trg_messaging_broadcast_participant
  after insert or delete on public.conversation_participant
  for each row execute function public.messaging_broadcast_participant();

drop trigger if exists trg_messaging_broadcast_participant_update on public.conversation_participant;
create trigger trg_messaging_broadcast_participant_update
  after update on public.conversation_participant
  for each row
  when (old.* is distinct from new.*)
  execute function public.messaging_broadcast_participant();
