-- In-app messaging — inbox search + custom filters + "mark as unread".
--
-- The WhatsApp-inspired inbox redesign needs three things the Phase 6
-- list_conversations RPC did not provide:
--   1. server-side text search over the conversation's people/subject
--      (organizer / place-owner / customer name, event title, place name)
--      so the search bar keeps working past the first page.
--   2. filter-by-type ('event' | 'place' | 'support') and filter-by-muted,
--      backing the user-addable "Events / Places / Muted" filter chips —
--      predefined, safe filter definitions, never arbitrary client SQL.
--   3. the resolved identity the row now shows: the other side's display
--      name + avatar, and the live event/place title, without an N+1 from
--      the transport.
--
-- Plus a mark_conversation_unread RPC (swipe-to-mark-unread / row menu):
-- it rewinds the caller's own last_read_at to just before the most recent
-- inbound message, so the conversation reads as unread again. No-op when
-- there is nothing inbound to be unread about.
--
-- The three new list_conversations params are appended and defaulted, so
-- the old callers keep working. Adding params changes the function
-- identity, so the 5-arg version is dropped first (an all-defaults call is
-- otherwise ambiguous). Pure projection + predicate change — no new table,
-- no RLS change; the SECURITY DEFINER body still keys every row on
-- auth.uid() through the conversation_participant join, and the event /
-- place / user_info reads it adds are only ever for a conversation the
-- caller already participates in.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

drop function if exists public.list_conversations(text, timestamptz, uuid, integer, text);

create or replace function public.list_conversations(
  p_filter text default 'active',       -- 'active' | 'archived' | 'all' | 'unread'
  p_cursor_ts timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20,
  p_role_scope text default 'all',      -- 'all' | 'member' | 'business'
  p_search text default null,           -- trimmed; matched against people + subject
  p_type text default null,             -- 'event' | 'place' | 'support' | 'direct'
  p_muted boolean default null          -- null = either; true/false = only that
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
    created_at             timestamptz,
    subject_title          text,
    other_user_id          uuid,
    other_display_name     text,
    other_username         text,
    other_avatar_public_id text,
    other_avatar_version   text
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
    select op.user_id, ui.full_name, ui.username,
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
      or c.title          ilike '%' || btrim(p_search) || '%'
      or ev.title         ilike '%' || btrim(p_search) || '%'
      or pl.name          ilike '%' || btrim(p_search) || '%'
      or other.full_name  ilike '%' || btrim(p_search) || '%'
      or other.username   ilike '%' || btrim(p_search) || '%'
    )
    and (
      p_cursor_ts is null
      or c.last_message_at < p_cursor_ts
      or (c.last_message_at = p_cursor_ts and c.id < p_cursor_id)
    )
  order by c.last_message_at desc nulls last, c.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke execute on function
  public.list_conversations(text, timestamptz, uuid, integer, text, text, text, boolean)
  from public, anon;
grant execute on function
  public.list_conversations(text, timestamptz, uuid, integer, text, text, text, boolean)
  to authenticated, service_role;

-- ============================================================
-- mark_conversation_unread — rewind the caller's read cursor so the
-- conversation shows as unread again. Mirrors set_conversation_state's
-- self-only, participant-gated shape.
-- ============================================================
create function public.mark_conversation_unread(p_conversation_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
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
$$;

revoke execute on function public.mark_conversation_unread(uuid) from public, anon;
grant execute on function public.mark_conversation_unread(uuid) to authenticated, service_role;
