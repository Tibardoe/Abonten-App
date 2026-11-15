-- Send a ticket to a friend: the organizer's switch also closes the offers
-- still waiting (decision X1).
--
-- Found in QA on 2026-11-15: turning sending off for an event stopped new
-- offers, but an offer made before the switch could still be accepted, so a
-- ticket could change hands after the organizer asked for named guests.
-- Now:
--   * ticket_transfer_set_event_setting() saves the switch and, when it is
--     turned off, closes the event's open offers in the same transaction
--     (cancel_reason 'organizer_off'); the tickets stay with their holders;
--   * the check every send and accept runs refuses a ticket whose event has
--     sending turned off, so an accept racing the switch is refused too.

-- ---------------------------------------------------------------------------
-- 1. A fourth reason an offer can be closed
-- ---------------------------------------------------------------------------

alter table public.ticket_transfer
  drop constraint if exists ticket_transfer_cancel_reason_check;

alter table public.ticket_transfer
  add constraint ticket_transfer_cancel_reason_check
  check (cancel_reason in ('sender', 'ticket_changed', 'restricted', 'organizer_off'));

-- ---------------------------------------------------------------------------
-- 2. Every send and accept checks the organizer's switch
-- ---------------------------------------------------------------------------

create or replace function public._ticket_transfer_check_ticket(
  p_ticket public.ticket,
  p_event_status text,
  p_max_moves smallint
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_ticket.status <> 'active' then
    perform public._ticket_transfer_fail('ticket_not_active');
  end if;
  if p_ticket.expires_at <= now() then
    perform public._ticket_transfer_fail('event_over');
  end if;
  -- 'canceled' and 'completed' events take no more moves.
  if p_event_status is distinct from 'published' then
    perform public._ticket_transfer_fail('event_over');
  end if;
  if p_ticket.transfer_count >= p_max_moves then
    perform public._ticket_transfer_fail('too_many_moves');
  end if;
  if exists (
    select 1
    from public.ticket_type tt
    join public.event_ticket_transfer_setting s on s.event_id = tt.event_id
    where tt.id = p_ticket.ticket_type_id and not s.enabled
  ) then
    perform public._ticket_transfer_fail('organizer_off');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The organizer's switch, closing open offers when it goes off
-- ---------------------------------------------------------------------------

-- The caller (@abonten/services) has already checked that p_user_id owns
-- the event. Returns the offers it closed, so their people can be told.
create or replace function public.ticket_transfer_set_event_setting(
  p_event_id uuid,
  p_enabled boolean,
  p_user_id uuid
)
returns table (transfer_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_ticket_transfer_setting (event_id, enabled, updated_at, updated_by)
  values (p_event_id, p_enabled, now(), p_user_id)
  on conflict (event_id) do update
    set enabled = excluded.enabled,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  if not p_enabled then
    -- An accept already holding an offer's lock finishes first; this then
    -- skips it, because it is no longer pending.
    return query
      update public.ticket_transfer t
      set status = 'cancelled',
          cancel_reason = 'organizer_off',
          decided_at = now()
      where t.event_id = p_event_id
        and t.status = 'pending'
      returning t.id;
  end if;
end;
$$;

revoke all on function public.ticket_transfer_set_event_setting(uuid, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.ticket_transfer_set_event_setting(uuid, boolean, uuid)
  to service_role;

revoke all on function public._ticket_transfer_check_ticket(public.ticket, text, smallint)
  from public, anon, authenticated;
grant execute on function public._ticket_transfer_check_ticket(public.ticket, text, smallint)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. Checks
-- ---------------------------------------------------------------------------

do $$
begin
  if has_function_privilege('authenticated',
       'public.ticket_transfer_set_event_setting(uuid, boolean, uuid)', 'execute')
     or has_function_privilege('anon',
       'public.ticket_transfer_set_event_setting(uuid, boolean, uuid)', 'execute') then
    raise exception 'migration check: ticket_transfer_set_event_setting must be service-role only';
  end if;
  if position('organizer_off' in pg_get_functiondef(
       'public._ticket_transfer_check_ticket(public.ticket, text, smallint)'::regprocedure)) = 0 then
    raise exception 'migration check: _ticket_transfer_check_ticket does not check the organizer switch';
  end if;
end;
$$;
