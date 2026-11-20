-- Complimentary tickets (docs/architecture/complimentary-tickets.md; Part 5
-- of docs/specifications/shows-seats-and-pricing.md, decision Y11).
--
-- An organizer gives free tickets to named people (cast, press, sponsors,
-- family): the tickets are real tickets of one of the event's types, on
-- the recipient's account, counted against the seats and the type's
-- stock, seated like any other (assigned seats), checked in at the door,
-- and never refundable (there was no payment). Each gift is one
-- ticket_checkout row marked complimentary (status 'paid', price, discount
-- and total all 0 so no sales or discount figure moves; complimentary_by
-- tells it apart) and no money moves: no transaction, no earning, no fee.
-- The seats are taken like any other: the type's stock goes down and the
-- attendance rows go through the event capacity rule.

begin;

alter table public.ticket_checkout
  add column if not exists complimentary_by uuid references public.user_info(id) on delete set null,
  add column if not exists complimentary_note text
    check (complimentary_note is null or length(complimentary_note) <= 200);

comment on column public.ticket_checkout.complimentary_by is
  'Who gave these tickets away (a complimentary gift: total 0, no payment), or null for a sale.';

create index if not exists ticket_checkout_complimentary_idx
  on public.ticket_checkout (event_id)
  where complimentary_by is not null;

-- Service role only: the caller (@abonten/services comps/complimentaryCore)
-- has checked that the giver acts for the event's owner, the recipient
-- and the quantity, and made a code and QR for each ticket.
create or replace function public.issue_complimentary_tickets(
  p_event_id        uuid,
  p_ticket_type_id  uuid,
  p_recipient_id    uuid,
  p_given_by        uuid,
  p_note            text,
  p_occurrence_id   uuid,
  p_expires_at      timestamptz,
  p_tickets         jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event     public.event%rowtype;
  v_type      public.ticket_type%rowtype;
  v_count     integer := jsonb_array_length(coalesce(p_tickets, '[]'::jsonb));
  v_checkout  uuid;
  v_session   uuid := gen_random_uuid();
begin
  if v_count < 1 or v_count > 40 then
    raise exception 'Give from 1 to 40 tickets at a time.'
      using errcode = 'check_violation';
  end if;

  select * into v_event from public.event where id = p_event_id;
  if not found or v_event.status is distinct from 'published' then
    raise exception 'This event is not on.' using errcode = 'check_violation';
  end if;
  if coalesce(
       (select max(o.ends_at) from public.event_occurrence o where o.event_id = v_event.id),
       v_event.ends_at, v_event.starts_at) <= now() then
    raise exception 'This event is over.' using errcode = 'check_violation';
  end if;

  select * into v_type from public.ticket_type
  where id = p_ticket_type_id and event_id = p_event_id
  for update;
  if not found then
    raise exception 'Ticket of type % not found', p_ticket_type_id
      using errcode = 'no_data_found';
  end if;
  if v_count % v_type.admits <> 0 then
    raise exception 'Ticket data mismatch for type %', p_ticket_type_id
      using errcode = 'check_violation';
  end if;

  if p_occurrence_id is not null and not exists (
    select 1 from public.event_occurrence o
    where o.id = p_occurrence_id and o.event_id = p_event_id and o.ends_at > now()
  ) then
    raise exception 'That date is no longer available.'
      using errcode = 'check_violation';
  end if;

  -- The tickets come out of the type's stock like sold ones.
  update public.ticket_type
  set quantity = quantity - v_count
  where id = p_ticket_type_id
    and (quantity is null or quantity >= v_count);
  if not found then
    raise exception 'Only % of these tickets are left.', v_type.quantity
      using errcode = 'check_violation';
  end if;

  insert into public.ticket_checkout (
    checkout_session_id, user_id, event_id, ticket_type_id, quantity, admits,
    unit_price, discount, discounted_units, total_price, status,
    completed_at, occurrence_id, complimentary_by, complimentary_note
  ) values (
    v_session, p_recipient_id, p_event_id, p_ticket_type_id, v_count, v_type.admits,
    0, 0, 0, 0, 'paid',
    now(), p_occurrence_id, p_given_by, nullif(btrim(coalesce(p_note, '')), '')
  )
  returning id into v_checkout;

  with ins as (
    insert into public.ticket (
      user_id, ticket_type_id, ticket_checkout_id, occurrence_id,
      qr_public_id, qr_version, ticket_code, expires_at,
      transaction_id, metadata, status
    )
    select
      p_recipient_id, p_ticket_type_id, v_checkout, p_occurrence_id,
      e->>'qr_public_id', e->>'qr_version', e->>'ticket_code', p_expires_at,
      null, jsonb_build_object('complimentary', true), 'active'
    from jsonb_array_elements(p_tickets) e
    returning id
  )
  insert into public.attendance (
    user_id, event_id, ticket_type_id, ticket_id, status, number_of_tickets
  )
  select p_recipient_id, p_event_id, p_ticket_type_id, ins.id, 'attending', 1
  from ins;

  return v_checkout;
end;
$$;

revoke all on function public.issue_complimentary_tickets(uuid, uuid, uuid, uuid, text, uuid, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.issue_complimentary_tickets(uuid, uuid, uuid, uuid, text, uuid, timestamptz, jsonb)
  to service_role;

do $$
begin
  if has_function_privilege('authenticated', 'public.issue_complimentary_tickets(uuid, uuid, uuid, uuid, text, uuid, timestamptz, jsonb)', 'execute') then
    raise exception 'migration check: complimentary tickets are issued by the server only';
  end if;
end;
$$;

commit;
