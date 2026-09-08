-- Allow ANY emoji as a reaction, not just the six-emoji quick palette.
--
-- The reaction bar gains a "+" that opens the OS emoji keyboard, so the
-- fixed allowlist added in 20260908170944 is now too strict. The reason that
-- allowlist existed still stands, though: message_reaction carries an
-- own-row RLS INSERT policy, so a participant can write to the table
-- straight from the client SDK, and without a guard the column would accept
-- any short string and render it verbatim in the other participant's thread.
--
-- So the check becomes shape-based instead of value-based. An emoji must:
--   * be 1..16 characters (a ZWJ sequence with modifiers still fits),
--   * contain no ASCII letter -- blocks "SPAM", "http", "lol",
--   * contain no whitespace -- blocks multi-token phrases, and
--   * contain at least one multi-byte UTF-8 character
--     (octet_length > char_length) -- blocks any pure-ASCII payload such as
--     "12345", "!!!!" or "<3", while every real emoji qualifies, including
--     keycaps like 1 which carry U+FE0F / U+20E3.
--
-- This is deliberately not a pictographic-property test: Postgres regex has
-- no \p{Extended_Pictographic}, and the four rules above already make it
-- impossible to store readable text. Verified against production over
-- rocket / ZWJ family / skin tone / keycap / flag (accepted) and
-- "SPAM" / "12345" / "!!!!" / emoji+letters / spaced (rejected).

alter table public.message_reaction
  drop constraint if exists message_reaction_emoji_palette;

alter table public.message_reaction
  add constraint message_reaction_emoji_shape
  check (
    char_length(emoji) between 1 and 16
    and emoji !~ '[A-Za-z]'
    and emoji !~ '[[:space:]]'
    and octet_length(emoji) > char_length(emoji)
  );

-- The RPC drops its hardcoded IN list and defers to the same rules, so the
-- two can no longer drift apart.
create or replace function public.toggle_message_reaction(
  p_message_id uuid,
  p_emoji text
)
  returns table (added boolean)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_caller  uuid := auth.uid();
  v_conv_id uuid;
  v_deleted timestamptz;
  v_current text;
begin
  if v_caller is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Same shape rules as the message_reaction_emoji_shape constraint; checked
  -- here too so the caller gets a clean 409 instead of a raw constraint error.
  if p_emoji is null
     or char_length(p_emoji) not between 1 and 16
     or p_emoji ~ '[A-Za-z]'
     or p_emoji ~ '[[:space:]]'
     or octet_length(p_emoji) <= char_length(p_emoji)
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
$$;

revoke execute on function public.toggle_message_reaction(uuid, text) from public, anon;
grant execute on function public.toggle_message_reaction(uuid, text) to authenticated, service_role;
