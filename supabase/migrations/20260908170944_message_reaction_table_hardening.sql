-- In-app messaging — close two gaps the reaction write path left open at the
-- TABLE level (the RPC already covers both, the direct client SDK path did not).
--
-- `toggle_message_reaction` is the intended write path, but message_reaction
-- also carries an own-row RLS INSERT policy (message_reaction_own_insert,
-- from the Phase-1 messaging schema) so a participant can write to the table
-- straight from the client SDK. Two things were only enforced inside the RPC:
--
--   1. THE EMOJI PALETTE. The column's only constraint was
--      char_length(emoji) between 1 and 16, so a participant could store any
--      short arbitrary string as an "emoji" and it would render verbatim in
--      the other participant's thread. Now a CHECK pins the column to the
--      same six-emoji palette as the RPC, MESSAGE_REACTION_EMOJIS in
--      @abonten/types, and toggleMessageReactionSchema in @abonten/validation.
--
--   2. conversation_id INTEGRITY. It is denormalized purely so realtime can
--      filter reactions by conversation, but nothing tied it to the parent
--      message's conversation — a client-supplied mismatch would broadcast
--      the change on the wrong conversation's channel (and so the real
--      participants' clients would never see it). It is now derived from the
--      message by a trigger and any client-supplied value is ignored.
--
-- Safe to apply: public.message_reaction had 0 rows when this ran (the
-- feature has not shipped to a client yet), so neither constraint can fail
-- on existing data.

-- 1. palette, enforced on the column itself
alter table public.message_reaction
  drop constraint if exists message_reaction_emoji_palette;
alter table public.message_reaction
  add constraint message_reaction_emoji_palette
  check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🙏'));

-- 2. conversation_id is always the parent message's, never the client's
create or replace function public.message_reaction_set_conversation()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  select m.conversation_id into new.conversation_id
    from public.message m
    where m.id = new.message_id;
  if new.conversation_id is null then
    raise exception 'Message not found' using errcode = 'no_data_found';
  end if;
  return new;
end;
$$;

revoke execute on function public.message_reaction_set_conversation() from public, anon, authenticated;

drop trigger if exists trg_message_reaction_set_conversation on public.message_reaction;
create trigger trg_message_reaction_set_conversation
  before insert or update of message_id, conversation_id
  on public.message_reaction
  for each row
  execute function public.message_reaction_set_conversation();
