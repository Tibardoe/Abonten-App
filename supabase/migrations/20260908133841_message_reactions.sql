-- In-app messaging — message reactions (contextual-action UX overhaul).
--
-- The `message_reaction` table shipped schema-only in Phase 1
-- (20260906230648_messaging_schema.sql) with participant-scoped own-row RLS
-- but no UI and no write path of its own. This migration turns it on:
--
--   1. adds a denormalized `conversation_id` (mirrors `message` /
--      `message_attachment`) so the realtime stream can filter reactions by
--      conversation the same way it filters messages.
--   2. adds `toggle_message_reaction(p_message_id, p_emoji)` — the single
--      SECURITY DEFINER write path, matching every other messaging mutation
--      (self-authorizes on auth.uid(), re-checks participation, never trusts
--      a client identity). One call adds the caller's reaction or removes it
--      if it was already there; it returns whether the row now exists.
--   3. constrains the emoji to the fixed six-emoji palette the UI offers, so
--      a malicious client can't stuff arbitrary text into the column.
--   4. adds `message_reaction` to the realtime publication (participant-only
--      RLS on the source table already authorizes the postgres_changes
--      subscription — same as `message`).
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

-- ============================================================
-- 1. denormalized conversation_id
-- ============================================================
alter table public.message_reaction
  add column if not exists conversation_id uuid
    references public.conversation(id) on delete cascade;

update public.message_reaction mr
  set conversation_id = m.conversation_id
  from public.message m
  where m.id = mr.message_id
    and mr.conversation_id is null;

alter table public.message_reaction
  alter column conversation_id set not null;

create index if not exists idx_message_reaction_conversation
  on public.message_reaction (conversation_id);

-- ============================================================
-- 2 + 3. toggle_message_reaction — the only write path
-- ============================================================
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
begin
  if v_caller is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Fixed palette — mirrors MESSAGE_REACTION_EMOJIS in @abonten/types.
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

  delete from public.message_reaction
    where message_id = p_message_id
      and user_id = v_caller
      and emoji = p_emoji;

  if found then
    added := false;
    return next;
    return;
  end if;

  insert into public.message_reaction (message_id, user_id, emoji, conversation_id)
    values (p_message_id, v_caller, p_emoji, v_conv_id)
    on conflict (message_id, user_id, emoji) do nothing;

  added := true;
  return next;
end;
$$;

revoke execute on function public.toggle_message_reaction(uuid, text) from public, anon;
grant execute on function public.toggle_message_reaction(uuid, text) to authenticated, service_role;

-- ============================================================
-- 4. realtime
-- ============================================================
alter table public.message_reaction replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reaction'
  ) then
    alter publication supabase_realtime add table public.message_reaction;
  end if;
end $$;
