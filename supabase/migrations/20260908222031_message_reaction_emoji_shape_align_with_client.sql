-- Align the database's reaction-emoji guard exactly with the client one.
--
-- 20260908215500 used `octet_length(emoji) > char_length(emoji)` to mean
-- "contains a multi-byte character". That is very slightly looser than
-- isValidReactionEmoji() in @abonten/core, which requires a code point ABOVE
-- U+00FF: a Latin-1 accented letter such as an e-acute is 2 bytes in UTF-8, so
-- the database would have accepted it while the API rejected it. Harmless in
-- practice, but a guard that differs between the two layers is exactly the
-- kind of drift the constraint exists to prevent -- and message_reaction has
-- an own-row RLS INSERT policy, so the database rule is the one that actually
-- binds a client writing directly.
--
-- Postgres regex has no \p{Extended_Pictographic}. The range below is built
-- with chr() (IMMUTABLE, so it is legal in a CHECK) and expresses the same
-- rule as the TypeScript regex: "contains a code point above U+00FF".
-- Verified on this database: e-acute -> rejected, '!' -> rejected,
-- rocket -> accepted, keycap-1 -> accepted, flag -> accepted.

alter table public.message_reaction
  drop constraint if exists message_reaction_emoji_shape;

alter table public.message_reaction
  add constraint message_reaction_emoji_shape
  check (
    char_length(emoji) between 1 and 16
    and emoji !~ '[A-Za-z]'
    and emoji !~ '[[:space:]]'
    and emoji ~ ('[^' || chr(1) || '-' || chr(255) || ']')
  );

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
$$;

revoke execute on function public.toggle_message_reaction(uuid, text) from public, anon;
grant execute on function public.toggle_message_reaction(uuid, text) to authenticated, service_role;
