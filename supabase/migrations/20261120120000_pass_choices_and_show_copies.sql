-- Fixes found walking the shows features on a phone (2026-11-20):
--
--  1. A ticket chosen with a pass was itself treated as a pass: its holder
--     could choose more shows from it, and from those, again and again
--     (ticket_pass_state, ticket_pass_claim). A pass is now only a ticket of
--     a pass type that was not itself a pass choice (its checkout has no
--     pass_ticket_id). A pass given as a free ticket stays a pass.
--  2. Shows added to a run, and copies, did not keep the listing's seating:
--     event_add_show now copies the event's seating plan and each ticket
--     type's section (docs/architecture/assigned-seats.md).
--  3. A listing Abonten has hidden or removed could still make new shows
--     and copies, and they came out visible: event_add_show refuses it.
--
-- Each function is rewritten in place (pg_get_functiondef + replace), every
-- replacement is checked, and a function already fixed is left alone, so the
-- file can run twice.

begin;

do $fix$
declare
  v_def text;
  v_new text;
  v_fn  regprocedure;
begin
  -- 1a. The pass state: a chosen ticket has none.
  v_def := pg_get_functiondef('public.ticket_pass_state(uuid, uuid)'::regprocedure);
  if position('A ticket chosen with a pass is not a pass itself.' in v_def) = 0 then
    v_new := replace(v_def,
$a$  if v_type.pass_shows is null then
    return null;
  end if;$a$,
$b$  if v_type.pass_shows is null then
    return null;
  end if;
  -- A ticket chosen with a pass is not a pass itself.
  if exists (
    select 1 from public.ticket_checkout c
    where c.id = v_host.ticket_checkout_id and c.pass_ticket_id is not null
  ) then
    return null;
  end if;$b$);
    if v_new = v_def then
      raise exception 'ticket_pass_state: the pass check was not found';
    end if;
    execute v_new;
  end if;

  -- 1b. Choosing a show: refused from a chosen ticket.
  v_def := pg_get_functiondef(
    'public.ticket_pass_claim(uuid, uuid, uuid, timestamptz, jsonb)'::regprocedure);
  if position('A ticket chosen with a pass is not a pass itself.' in v_def) = 0 then
    v_new := replace(v_def,
$a$  if v_host_type.pass_shows is null then
    raise exception 'This ticket is not a pass.'$a$,
$b$  if v_host_type.pass_shows is null
     -- A ticket chosen with a pass is not a pass itself.
     or exists (
       select 1 from public.ticket_checkout c
       where c.id = v_host.ticket_checkout_id and c.pass_ticket_id is not null
     ) then
    raise exception 'This ticket is not a pass.'$b$);
    if v_new = v_def then
      raise exception 'ticket_pass_claim: the pass check was not found';
    end if;
    execute v_new;
  end if;

  -- 2 and 3. New shows and copies.
  select p.oid::regprocedure into strict v_fn
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'event_add_show';
  v_def := pg_get_functiondef(v_fn);
  if position('tt.seating_section_id' in v_def) = 0 then
    v_new := v_def;

    v_new := replace(v_new,
$a$  if v_src.status is distinct from 'published' then
    raise exception 'Only a published listing can be copied.'
      using errcode = 'check_violation';
  end if;$a$,
$b$  if v_src.status is distinct from 'published' then
    raise exception 'Only a published listing can be copied.'
      using errcode = 'check_violation';
  end if;
  -- A listing Abonten has hidden or removed takes no new shows or copies.
  if v_src.moderation_state in ('hidden', 'removed') then
    raise exception 'Abonten has hidden this listing, so it can''t be copied.'
      using errcode = 'check_violation';
  end if;$b$);
    if position('Abonten has hidden this listing' in v_new) = 0 then
      raise exception 'event_add_show: the published check was not found';
    end if;

    v_new := replace(v_new,
$a$    event_id, type, price, currency, quantity, admits, available_from, available_until, pass_shows
  )$a$,
$b$    event_id, type, price, currency, quantity, admits, available_from, available_until, pass_shows,
    seating_section_id
  )$b$);
    v_new := replace(v_new,
$a$    tt.available_until + v_shift,
    tt.pass_shows
  from public.ticket_type tt$a$,
$b$    tt.available_until + v_shift,
    tt.pass_shows,
    tt.seating_section_id
  from public.ticket_type tt$b$);
    if (length(v_new) - length(replace(v_new, 'seating_section_id', '')))
         / length('seating_section_id') <> 2 then
      raise exception 'event_add_show: the ticket type copy was not found';
    end if;

    v_new := replace(v_new,
$a$  insert into public.event_group_discount (event_id, min_tickets, percent_off)$a$,
$b$  -- The seating plan comes too; each ticket type kept its section above.
  insert into public.event_seating (event_id, plan_id)
  select v_new, s.plan_id
  from public.event_seating s
  where s.event_id = v_src.id;

  insert into public.event_group_discount (event_id, min_tickets, percent_off)$b$);
    if position('insert into public.event_seating' in v_new) = 0 then
      raise exception 'event_add_show: the group price copy was not found';
    end if;

    execute v_new;
  end if;
end;
$fix$;

-- The rewrites keep each function's grants; check them anyway.
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
