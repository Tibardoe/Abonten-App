-- In-app messaging — Phase 8 follow-up.
--
-- get_unread_conversation_count still counted a 'hidden' / 'restricted'
-- conversation toward the nav badge, while list_conversations (updated in
-- 20260907094000) already drops it. Bring the badge RPC in line so a
-- moderated thread doesn't leave a phantom unread on the Messages tab.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

create or replace function public.get_unread_conversation_count()
  returns integer
  language sql
  security definer
  set search_path = ''
as $$
  with me as (select auth.uid() as uid)
  select count(*)::integer
  from public.conversation c
  join public.conversation_participant cp
    on cp.conversation_id = c.id
   and cp.user_id = (select uid from me)
   and cp.left_at is null
   and cp.archived = false
  where c.moderation_state not in ('removed','hidden','restricted')
    and exists (
      select 1 from public.message m
      where m.conversation_id = c.id
        and m.deleted_at is null
        and m.moderation_state = 'visible'
        and m.message_type <> 'system'
        and m.sender_id is distinct from (select uid from me)
        and m.created_at > cp.last_read_at
    );
$$;
