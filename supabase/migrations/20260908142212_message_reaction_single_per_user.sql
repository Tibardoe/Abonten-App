-- In-app messaging — one reaction per user per message.
--
-- The initial reactions migration (20260908133841) kept the Phase-1 PK
-- `(message_id, user_id, emoji)`, which allowed a user to stack several
-- emoji on one message. The chat UX pass settles on the mature-messenger
-- model instead: a user has AT MOST ONE reaction per message — tapping a
-- different emoji replaces it, tapping the active one removes it.
--
--   1. de-dupe (no-op in prod: reactions have not shipped to a client yet),
--   2. swap the PK to `(message_id, user_id)`,
--   3. rewrite `toggle_message_reaction` to upsert-replace on that key.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

-- 1. keep one arbitrary row per (message, user)
delete from public.message_reaction a
  using public.message_reaction b
  where a.message_id = b.message_id
    and a.user_id = b.user_id
    and a.ctid < b.ctid;

-- 2. one-reaction-per-user key
alter table public.message_reaction
  drop constraint if exists message_reaction_pkey;
alter table public.message_reaction
  add constraint message_reaction_pkey primary key (message_id, user_id);

-- 3. upsert-replace toggle
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

  if p_emoji not in ('👍', '❤️', '😂', '😮', '😢', '🙏') then
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
