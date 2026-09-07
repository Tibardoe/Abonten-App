-- In-app messaging — Phase 8 (moderation of reported conversations / messages).
--
-- A report against a `message` or `conversation` (target types already
-- allowed by report_target_type_check since Phase 1) can now be actioned
-- from the admin console the same way an event / place / review is:
-- apply_moderation_action flips moderation_state and stamps the audit
-- columns, report_event records it, resolve_report closes the thread.
--
--  1. audit columns on message + conversation (the RPC's UPDATE writes
--     moderated_at / moderated_by / moderation_reason like every other
--     moderatable table).
--  2. widen both moderation_state CHECKs with 'restricted' so the column
--     matches event/place (the messaging UI only ever uses hide/remove,
--     but keeping the domain identical avoids a special case in the RPC).
--  3. apply_moderation_action: add message -> public.message and
--     conversation -> public.conversation to the target table map.
--  4. list_conversations: a hidden / removed / restricted conversation
--     drops out of the participant's inbox (staff still reach it through
--     the report, which carries the id).
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

-- 1. audit columns -----------------------------------------------------------
alter table public.message
  add column if not exists moderated_at      timestamptz,
  add column if not exists moderated_by      uuid references public.user_info(id) on delete set null,
  add column if not exists moderation_reason text;

alter table public.conversation
  add column if not exists moderated_at      timestamptz,
  add column if not exists moderated_by      uuid references public.user_info(id) on delete set null,
  add column if not exists moderation_reason text;

-- 2. widen the state CHECKs ------------------------------------------------
alter table public.message  drop constraint if exists message_moderation_state_check;
alter table public.message  add  constraint message_moderation_state_check
  check (moderation_state in ('visible','hidden','removed','restricted'));

alter table public.conversation drop constraint if exists conversation_moderation_state_check;
alter table public.conversation add  constraint conversation_moderation_state_check
  check (moderation_state in ('visible','hidden','removed','restricted'));

-- 3. apply_moderation_action — add the two messaging target types --------
create or replace function public.apply_moderation_action(
  p_actor_id        uuid,
  p_target_type     text,
  p_target_id       uuid,
  p_action          text,
  p_reason          text,
  p_report_id       uuid,
  p_idempotency_key text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_existing   public.moderation_action%rowtype;
  v_new_state  text;
  v_table      text;
  v_action_id  uuid;
begin
  if not exists (
    select 1 from public.admin_user au
    where au.user_id = p_actor_id and au.status = 'active'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_existing
  from public.moderation_action
  where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'applied', false, 'idempotent_replay', true,
      'moderation_action_id', v_existing.id, 'action', v_existing.action
    );
  end if;

  v_new_state := case p_action
    when 'hide'       then 'hidden'
    when 'unhide'     then 'visible'
    when 'remove'     then 'removed'
    when 'restore'    then 'visible'
    when 'restrict'   then 'restricted'
    when 'unrestrict' then 'visible'
    else null
  end;
  if v_new_state is null then
    raise exception 'Unknown moderation action: %', p_action using errcode = '22023';
  end if;

  v_table := case p_target_type
    when 'event'         then 'public.event'
    when 'place'         then 'public.place'
    when 'highlight'     then 'public.highlight'
    when 'event_review'  then 'public.event_review'
    when 'place_review'  then 'public.place_review'
    when 'user_review'   then 'public.review'
    when 'message'       then 'public.message'
    when 'conversation'  then 'public.conversation'
    else null
  end;
  if v_table is null then
    raise exception 'target_type % is not moderatable via this RPC', p_target_type
      using errcode = '22023';
  end if;

  insert into public.moderation_action (
    actor_id, target_type, target_id, action, reason, report_id, idempotency_key
  )
  values (p_actor_id, p_target_type, p_target_id, p_action, p_reason, p_report_id, p_idempotency_key)
  returning id into v_action_id;

  execute format(
    'update %s set moderation_state = $1, moderated_at = now(), moderated_by = $2, moderation_reason = $3 where id = $4',
    v_table
  ) using v_new_state, p_actor_id, p_reason, p_target_id;

  if p_report_id is not null then
    insert into public.report_event (report_id, actor_id, kind, data)
    values (
      p_report_id, p_actor_id, 'action_taken',
      jsonb_build_object('action', p_action, 'target_type', p_target_type,
                         'target_id', p_target_id, 'new_state', v_new_state)
    );
  end if;

  return jsonb_build_object(
    'applied', true, 'idempotent_replay', false,
    'moderation_action_id', v_action_id, 'new_state', v_new_state
  );
end;
$function$;

-- 4. list_conversations — a moderated conversation leaves the inbox ------
create or replace function public.list_conversations(
  p_filter text default 'active',
  p_cursor_ts timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20,
  p_role_scope text default 'all'
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
    and (
      p_cursor_ts is null
      or c.last_message_at < p_cursor_ts
      or (c.last_message_at = p_cursor_ts and c.id < p_cursor_id)
    )
  order by c.last_message_at desc nulls last, c.id desc
  limit least(greatest(p_limit, 1), 50);
$$;
