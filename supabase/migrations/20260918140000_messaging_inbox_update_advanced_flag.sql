-- Inbox broadcast: say whether a conversation update is a NEW message.
--
-- `conversation_update` (20260918120100) is sent whenever the last-message
-- fields change. Most of those are new messages, but not all: deleting the
-- latest message rolls the conversation back to the one before it
-- (delete_message), and staff tooling can restore it. The client raised the
-- unread badge for every update whose sender was someone else, so a deletion
-- by the other person counted as a new unread message (seen on device: the
-- badge climbing with each rollback).
--
-- Only the server knows the previous value, so it says so: `advanced` is true
-- when last_message_at moved forward (or appeared for the first time). The
-- client counts an update as unread only when it advanced, and refetches the
-- inbox for one that did not (its counts may have gone down).
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
      'status', new.status,
      'advanced', coalesce(
        new.last_message_at > old.last_message_at,
        new.last_message_at is not null and old.last_message_at is null
      )
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
