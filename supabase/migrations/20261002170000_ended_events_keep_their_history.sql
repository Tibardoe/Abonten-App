-- An ended event keeps what people did with it.
--
-- Every night the `delete-expired-events` edge function finds the events
-- whose last date is over and calls archive_or_delete_expired_event() for
-- each. That function tried a hard DELETE and fell back to "archive" only
-- when a foreign key or a check refused the delete, which in practice
-- meant "archive when there is money on the ledger".
--
-- A free ticket has no checkout and no ledger row, so nothing refused the
-- delete of a free event, and the cascade took the tickets, the attendance
-- and the reviews with it. Reproduced on the local stack: one free ticket,
-- checked in, one review -> event, ticket, attendance and review all gone.
-- A review can only be written once an event has ended (and needs a
-- checked-in ticket), so on a free event people had until the next
-- midnight UTC to write one, and it was then deleted with the event; "My
-- tickets" lost the ticket. Deleting an event by hand has refused exactly
-- this since 2026-09 (deleteEvent: "this event has ticket sales,
-- attendance or reviews"). The nightly job did it anyway.
--
-- The function now decides the same way a person's delete does:
--
--   * anyone holds a ticket, attended, reviewed or paid -> archive;
--   * nobody ever did                                    -> delete, as before;
--   * the database refuses the delete (ledger or promotion history)
--                                                        -> archive, as before.
--
-- It also checks for itself that every date of the event is over, instead
-- of trusting the caller: a function that destroys should not depend on
-- its caller having read the dates correctly. And the flyer of a deleted
-- event is put on the Cloudinary clean-up queue, whose drain keeps an image
-- another listing or a draft still uses.
--
-- Archived is not hidden: RLS still lets anyone open a published event by
-- its link, so a ticket holder can find the event and review it. Archived
-- only takes it out of discovery. Same name, arguments, grants and result
-- keys, so the edge function keeps working unchanged.

create or replace function public.archive_or_delete_expired_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event  public.event%rowtype;
  v_ended  boolean;
  v_reason text;
begin
  select * into v_event from public.event e where e.id = p_event_id for update;
  if not found then
    return jsonb_build_object('event_id', p_event_id, 'hard_deleted', false,
                              'archived', false, 'skipped', 'missing');
  end if;
  if v_event.archived_at is not null then
    return jsonb_build_object('event_id', p_event_id, 'hard_deleted', false,
                              'archived', true, 'skipped', 'already_archived');
  end if;

  -- Ended: the last date is over. An event with dates of its own
  -- (event_occurrence) is judged by those; otherwise by its own end. An
  -- event with no end at all is never retired here.
  if exists (select 1 from public.event_occurrence o where o.event_id = p_event_id) then
    v_ended := not exists (
      select 1 from public.event_occurrence o
      where o.event_id = p_event_id and o.ends_at >= now());
  else
    v_ended := v_event.ends_at is not null and v_event.ends_at < now();
  end if;
  if not v_ended then
    return jsonb_build_object('event_id', p_event_id, 'hard_deleted', false,
                              'archived', false, 'skipped', 'not_ended');
  end if;

  -- Anything a person did with the event is history, and history is kept.
  v_reason := case
    when exists (select 1 from public.attendance a where a.event_id = p_event_id)
      then 'attendance'
    when exists (select 1 from public.ticket t
                 join public.ticket_type tt on tt.id = t.ticket_type_id
                 where tt.event_id = p_event_id)
      then 'tickets'
    when exists (select 1 from public.event_review r where r.event_id = p_event_id)
      then 'reviews'
    when exists (select 1 from public.ticket_checkout c
                 where c.event_id = p_event_id and c.status = 'paid')
      then 'paid_checkout'
  end;

  if v_reason is null then
    begin
      delete from public.event where id = p_event_id;
      -- Queued, not destroyed here: the drain keeps an image another
      -- listing or a draft still uses.
      perform public.cloudinary_cleanup_enqueue(v_event.flyer_public_id, 'image');
      return jsonb_build_object('event_id', p_event_id, 'hard_deleted', true,
                                'archived', false);
    exception
      -- Ledger rows and paid promotions cannot lose their event.
      when check_violation or foreign_key_violation then
        v_reason := 'financial_history';
    end;
  end if;

  update public.event
  set archived_at = coalesce(archived_at, now())
  where id = p_event_id;

  return jsonb_build_object('event_id', p_event_id, 'hard_deleted', false,
                            'archived', true, 'reason', v_reason);
end;
$function$;

comment on function public.archive_or_delete_expired_event(uuid) is
  'Retires one event whose every date is over: archives it when anyone holds a ticket, '
  'attended, reviewed or paid (or the ledger refuses the delete); deletes it, and queues its '
  'flyer for clean-up, only when nobody did. Does nothing to an event that has not ended. '
  'Service role only.';

revoke all on function public.archive_or_delete_expired_event(uuid) from public, anon, authenticated;
grant execute on function public.archive_or_delete_expired_event(uuid) to service_role;
