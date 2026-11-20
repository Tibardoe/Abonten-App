-- Ticket holders still see the events they hold tickets for when Abonten
-- hides the listing (owner's decision, 2026-11-20).
--
-- Hiding a listing (moderation_state = 'hidden') made its buyers' tickets
-- vanish from My Tickets on the website and in the app: the ticket lists
-- join ticket -> ticket_type -> event, event_select hides a hidden event from
-- everyone but its organizer side, and ticket_type_select reads the event
-- through the same rule. A buyer could no longer open the QR code they need
-- at the door, nor see a refund.
--
-- A second SELECT policy, for signed-in people only, lets a person read a
-- hidden event they hold a ticket for (any status, so cancelled and refunded
-- tickets keep their event too). Discovery is unchanged: lists and search
-- filter moderation themselves, and a holder only ever gains the events they
-- hold tickets for. Listings Abonten has REMOVED stay invisible.
--
-- The holder's events are read once per statement (the function call sits in
-- a SELECT, an init plan), never per row; the function is SECURITY DEFINER so
-- reading ticket does not run ticket_select, which reads event again.

begin;

create or replace function public.ticket_holder_event_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct tt.event_id), array[]::uuid[])
  from public.ticket t
  join public.ticket_type tt on tt.id = t.ticket_type_id
  where t.user_id = (select auth.uid());
$$;

comment on function public.ticket_holder_event_ids() is
  'The events the signed-in person holds a ticket for, in any status. Read once per statement by the event_select_ticket_holder policy.';

revoke all on function public.ticket_holder_event_ids() from public, anon;
grant execute on function public.ticket_holder_event_ids() to authenticated, service_role;

drop policy if exists event_select_ticket_holder on public.event;
create policy event_select_ticket_holder on public.event
  for select
  to authenticated
  using (
    moderation_state = 'hidden'
    and id = any ((select public.ticket_holder_event_ids())::uuid[])
  );

do $check$
begin
  if has_function_privilege('anon', 'public.ticket_holder_event_ids()', 'execute') then
    raise exception 'migration check: ticket_holder_event_ids must not be executable by anon';
  end if;
end;
$check$;

commit;
