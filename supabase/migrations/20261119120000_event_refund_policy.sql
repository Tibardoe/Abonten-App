-- An event's refund policy (PROJECT.md §77, @abonten/core/refundPolicy).
--
-- Until when a buyer may cancel a paid ticket and get the ticket price
-- back: until the show starts (the default, how every event behaved
-- until now), until 24/48/72/168 hours before it, or never. The services
-- check it on every buyer cancellation (cancelUserTicketCore,
-- cancelEventTicketsCore); the organizer and staff are not bound by it.
--
-- Once people hold tickets, the policy may only become more generous:
-- buyers bought on the terms the page showed them. guard_event_refund_policy
-- refuses a stricter change made from a client session; the services make
-- the same check before writing.

alter table public.event
  add column if not exists refund_policy text not null default 'until_start',
  add column if not exists refund_cutoff_hours integer;

alter table public.event
  add constraint event_refund_policy_kind_check
    check (refund_policy in ('until_start', 'until_cutoff', 'none')),
  add constraint event_refund_cutoff_hours_check
    check (
      (refund_policy = 'until_cutoff' and refund_cutoff_hours in (24, 48, 72, 168))
      or (refund_policy <> 'until_cutoff' and refund_cutoff_hours is null)
    );

comment on column public.event.refund_policy is
  'Buyer refunds of paid tickets: until_start | until_cutoff | none (@abonten/core/refundPolicy).';
comment on column public.event.refund_cutoff_hours is
  'Hours before the show refunds close, when refund_policy = until_cutoff (24, 48, 72 or 168).';

-- Whether anyone holds a ticket for the event (a cancelled one doesn't
-- count). SECURITY DEFINER because the guard below runs as the organizer's
-- session, which may not read every ticket; it says no more than the
-- public attendance count already does.
create or replace function public.event_has_live_tickets(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ticket t
    join public.ticket_type tt on tt.id = t.ticket_type_id
    where tt.event_id = p_event_id
      and t.status <> 'cancelled'
  );
$$;

revoke all on function public.event_has_live_tickets(uuid) from public;
grant execute on function public.event_has_live_tickets(uuid)
  to authenticated, service_role;

create or replace function public.guard_event_refund_policy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old integer;
  v_new integer;
begin
  -- The services check this themselves before writing as the service.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- How long before the show refunds close; 'none' = never open.
  v_old := case old.refund_policy
    when 'none' then 1000000
    when 'until_cutoff' then coalesce(old.refund_cutoff_hours, 0)
    else 0
  end;
  v_new := case new.refund_policy
    when 'none' then 1000000
    when 'until_cutoff' then coalesce(new.refund_cutoff_hours, 0)
    else 0
  end;

  if v_new > v_old and public.event_has_live_tickets(new.id) then
    raise exception 'People already hold tickets for this event, so its refund policy can only become more generous.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists event_refund_policy_guard on public.event;
create trigger event_refund_policy_guard
  before update of refund_policy, refund_cutoff_hours on public.event
  for each row
  execute function public.guard_event_refund_policy();
