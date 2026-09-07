-- In-app messaging — Phase 6 (unified organizer / place inbox).
--
-- One inbox for everything: a user who both messages organizers AND runs
-- their own events/places sees both sides in /messages. This adds a role
-- dimension so that combined list can be split into "As customer" (rows
-- where I joined as a plain member) and "As organizer" (rows where I'm the
-- business side — organizer / place_owner / staff / admin), on top of the
-- existing active/archived/unread filter.
--
-- The new param is appended and defaulted, so existing callers (and the
-- mobile app until it ships the new arg) keep working unchanged. Adding a
-- param changes the function's identity, so the 4-arg version is dropped
-- first — otherwise the two overloads make an all-defaults call ambiguous.
-- Pure projection change — no new table, no RLS change; the SECURITY
-- DEFINER body still keys every row on auth.uid() via the
-- conversation_participant join.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

drop function if exists public.list_conversations(text, timestamptz, uuid, integer);

create or replace function public.list_conversations(
  p_filter text default 'active',       -- 'active' | 'archived' | 'all' | 'unread'
  p_cursor_ts timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20,
  p_role_scope text default 'all'       -- 'all' | 'member' | 'business'
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
      p_role_scope is null
      or p_role_scope = 'all'
      or (p_role_scope = 'member'   and cp.role = 'member')
      or (p_role_scope = 'business' and cp.role in ('organizer','place_owner','staff','admin'))
    )
    and (
      p_cursor_ts is null
      or c.last_message_at < p_cursor_ts
      or (c.last_message_at = p_cursor_ts and c.id < p_cursor_id)
    )
  order by c.last_message_at desc nulls last, c.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke execute on function public.list_conversations(text, timestamptz, uuid, integer, text) from public, anon;
grant execute on function public.list_conversations(text, timestamptz, uuid, integer, text) to authenticated, service_role;
