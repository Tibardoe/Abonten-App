-- Full-system audit 2026-09-25: client writes that went further than the
-- apps ever do (each reproduced against the local stack).
--
-- 1. attendance: any signed-in account could INSERT an 'attending' row for
--    ANY event, with any number_of_tickets. Rows count against the event's
--    capacity (event_capacity_check), so one account could mark someone
--    else's event sold out, and inflate its public attendance count.
--    Attendance is written only by issue_free_ticket /
--    issue_tickets_for_checkout (SECURITY DEFINER); the attendee's own
--    client only marks a row cancelled when they cancel their ticket.
-- 2. ticket: an organizer's UPDATE right (needed for door check-in) covered
--    every column: they could move a buyer's paid ticket to another account,
--    change its expiry, detach it from its transaction, or revive a
--    cancelled/refunded one. A client may now only check a ticket in or
--    undo that (active <-> used, used_at, updated_at).
-- 3. payout_account: written directly, an organizer skipped the market's
--    rail rules and could file a Ghana wallet as an NGN account. The
--    service writes payout accounts with the service role after its checks.

-- 1 ------------------------------------------------------------------------
revoke insert on public.attendance from anon, authenticated;

create or replace function public.guard_attendance_client_update()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  -- A repeated write that changes nothing (a retried cancel) is harmless.
  if to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;
  -- The only client write: an attendee (or the organizer) marking a row
  -- cancelled. Nothing else about it may change.
  if old.status is distinct from 'attending'
     or new.status is distinct from 'cancelled'
     or new.user_id is distinct from old.user_id
     or new.event_id is distinct from old.event_id
     or new.ticket_type_id is distinct from old.ticket_type_id
     or new.ticket_id is distinct from old.ticket_id
     or new.number_of_tickets is distinct from old.number_of_tickets
     or new.for_someone_else is distinct from old.for_someone_else
     or new.name is distinct from old.name
     or new.email is distinct from old.email
     or new.phone is distinct from old.phone
     or new.created_at is distinct from old.created_at then
    raise exception 'Attendance is recorded by Abonten'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists attendance_client_update_guard on public.attendance;
create trigger attendance_client_update_guard
  before update on public.attendance
  for each row execute function public.guard_attendance_client_update();

-- 2 ------------------------------------------------------------------------
create or replace function public.guard_ticket_client_update()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  -- A repeated write that changes nothing (a retried cancel) is harmless.
  if to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;
  if not (
       (old.status = 'active' and new.status = 'used')
    or (old.status = 'used' and new.status = 'active')
  ) then
    raise exception 'A ticket can only be checked in or have its check-in undone'
      using errcode = '42501';
  end if;
  -- Every column except the check-in ones must stay as it was.
  if (to_jsonb(new) - array['status', 'used_at', 'updated_at'])
     is distinct from (to_jsonb(old) - array['status', 'used_at', 'updated_at']) then
    raise exception 'A ticket can only be checked in or have its check-in undone'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists ticket_client_update_guard on public.ticket;
create trigger ticket_client_update_guard
  before update on public.ticket
  for each row execute function public.guard_ticket_client_update();

-- 3 ------------------------------------------------------------------------
revoke insert, update, delete on public.payout_account from anon, authenticated;
