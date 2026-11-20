-- A pass no longer offers, or takes, a show Abonten has hidden or removed
-- (2026-11-20). Nobody can buy a ticket for a hidden listing, but a pass
-- holder could still choose one: ticket_pass_state listed every published
-- show of the run, and ticket_pass_claim checked only that it was published
-- and still to come. The pass's own show and shows already chosen stay on
-- the list, so a holder keeps sight of their tickets.
--
-- In-place rewrites (pg_get_functiondef + replace), each checked, and a
-- function already changed is left alone, so the file can run twice.

begin;

do $fix$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.ticket_pass_state(uuid, uuid)'::regprocedure);
  if position('moderation_state' in v_def) = 0 then
    v_new := replace(v_def,
$a$        or (e.status = 'published' and e.archived_at is null
            and coalesce(e.ends_at, e.starts_at) > now())$a$,
$b$        or (e.status = 'published' and e.archived_at is null
            and coalesce(e.ends_at, e.starts_at) > now()
            and e.moderation_state is distinct from 'hidden'
            and e.moderation_state is distinct from 'removed')$b$);
    if v_new = v_def then
      raise exception 'ticket_pass_state: the show list was not found';
    end if;
    execute v_new;
  end if;

  v_def := pg_get_functiondef(
    'public.ticket_pass_claim(uuid, uuid, uuid, timestamptz, jsonb)'::regprocedure);
  if position('v_target.moderation_state' in v_def) = 0 then
    v_new := replace(v_def,
$a$  if v_target.status is distinct from 'published' or v_target.starts_at <= now() then
    raise exception 'This show can no longer be chosen.'$a$,
$b$  if v_target.status is distinct from 'published' or v_target.starts_at <= now()
     or v_target.moderation_state in ('hidden', 'removed') then
    raise exception 'This show can no longer be chosen.'$b$);
    if v_new = v_def then
      raise exception 'ticket_pass_claim: the show check was not found';
    end if;
    execute v_new;
  end if;
end;
$fix$;

do $check$
begin
  if has_function_privilege('authenticated',
       'public.ticket_pass_claim(uuid, uuid, uuid, timestamptz, jsonb)', 'execute')
     or has_function_privilege('authenticated',
       'public.ticket_pass_state(uuid, uuid)', 'execute') then
    raise exception 'migration check: the pass functions must stay service role only';
  end if;
end;
$check$;

commit;
