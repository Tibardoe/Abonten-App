-- Close the free-RSVP direct-insert bypass.
--
-- Paid ticket issuance already goes through a SECURITY DEFINER RPC
-- (issue_tickets_for_checkout) that does inventory reservation + the
-- sales-window checks atomically. The FREE "I'm attending" path, however,
-- still ran as a sequence of PostgREST calls on the *caller's* session
-- (registerForFreeEventCore): SELECT free ticket_type -> CAS decrement its
-- quantity -> INSERT ticket -> INSERT attendance. Because
-- `ticket_owner_insert` RLS was just `WITH CHECK (auth.uid() = user_id)`, a
-- crafted client could skip the service entirely and INSERT a `ticket` row
-- directly — no inventory decrement, no "event still on sale" check, no
-- occurrence validation.
--
-- issue_free_ticket does the whole DB mutation for a free RSVP in one
-- transaction, re-validating the event + occurrence against now() the same
-- way create_ticket_checkout does. QR generation + the Cloudinary upload
-- stay in registerForFreeEventCore (the only non-DB step); the caller
-- passes the finished ticket_code / qr_public_id / qr_version.
--
-- With this in place NOTHING needs a client-session INSERT on `ticket`
-- anymore (paid = issue_tickets_for_checkout, free = issue_free_ticket,
-- admin/webhook = service role), so the RLS INSERT policy is dropped and
-- the INSERT grant revoked from authenticated/anon.

create or replace function public.issue_free_ticket(
  p_user_id uuid,
  p_event_id uuid,
  p_occurrence_id uuid,
  p_ticket_code text,
  p_qr_public_id text,
  p_qr_version text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_event_status text;
  v_event_starts_at timestamptz;
  v_occ_count integer;
  v_has_future boolean;
  v_ticket_type_id uuid;
  v_ticket_id uuid;
  v_updated_qty integer;
begin
  if p_user_id is null then
    raise exception 'user id is required';
  end if;

  if v_caller is not null and v_caller <> p_user_id then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_expires_at is null then
    raise exception 'expiry is required';
  end if;

  if coalesce(p_ticket_code, '') = ''
     or coalesce(p_qr_public_id, '') = ''
     or coalesce(p_qr_version, '') = '' then
    raise exception 'ticket code and qr are required';
  end if;

  -- ---- Sales-window guard (server clock is authoritative) -------------
  select status, starts_at
    into v_event_status, v_event_starts_at
  from public.event
  where id = p_event_id;

  if not found then
    raise exception 'No event found!' using errcode = 'no_data_found';
  end if;

  if v_event_status is distinct from 'published' then
    raise exception 'This event is no longer accepting RSVPs.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_occ_count
  from public.event_occurrence
  where event_id = p_event_id;

  if v_occ_count > 0 then
    v_has_future := exists (
      select 1 from public.event_occurrence
      where event_id = p_event_id and starts_at > now()
    );
  else
    v_has_future := v_event_starts_at is not null
      and v_event_starts_at > now();
  end if;

  if not v_has_future then
    raise exception 'This event is not open for registration.'
      using errcode = 'check_violation';
  end if;

  if p_occurrence_id is not null then
    if not exists (
      select 1 from public.event_occurrence
      where id = p_occurrence_id
        and event_id = p_event_id
        and starts_at > now()
    ) then
      raise exception 'That date is no longer available.'
        using errcode = 'check_violation';
    end if;
  end if;
  -- -------------------------------------------------------------------

  select id into v_ticket_type_id
  from public.ticket_type
  where event_id = p_event_id and type = 'FREE'
  limit 1;

  if v_ticket_type_id is null then
    raise exception 'This event has no free registration available'
      using errcode = 'no_data_found';
  end if;

  -- Friendly pre-check (the partial unique index
  -- ticket_one_active_free_registration is the real race guarantee).
  if exists (
    select 1 from public.ticket
    where user_id = p_user_id
      and ticket_type_id = v_ticket_type_id
      and status in ('active', 'used')
      and ticket_checkout_id is null
  ) then
    raise exception 'Ticket for this event already bought'
      using errcode = 'unique_violation';
  end if;

  -- Atomic single-unit reservation — no read-then-write window.
  update public.ticket_type
  set quantity = quantity - 1
  where id = v_ticket_type_id
    and (quantity is null or quantity >= 1)
  returning quantity into v_updated_qty;

  if not found then
    raise exception 'That ticket is no longer available.'
      using errcode = 'check_violation';
  end if;

  begin
    insert into public.ticket (
      user_id, ticket_type_id, transaction_id, seat_number, status,
      qr_public_id, qr_version, expires_at, used_at, ticket_code,
      occurrence_id, created_at, updated_at
    )
    values (
      p_user_id, v_ticket_type_id, null, null, 'active',
      p_qr_public_id, p_qr_version, p_expires_at, null, p_ticket_code,
      p_occurrence_id, now(), null
    )
    returning id into v_ticket_id;
  exception when unique_violation then
    raise exception 'Ticket for this event already bought'
      using errcode = 'unique_violation';
  end;

  insert into public.attendance (
    user_id, event_id, ticket_type_id, ticket_id, status, number_of_tickets
  )
  values (
    p_user_id, p_event_id, v_ticket_type_id, v_ticket_id, 'attending', 1
  );

  return v_ticket_id;
end;
$$;

revoke execute on function public.issue_free_ticket(
  uuid, uuid, uuid, text, text, text, timestamptz
) from public, anon;

grant execute on function public.issue_free_ticket(
  uuid, uuid, uuid, text, text, text, timestamptz
) to authenticated, service_role;

-- No client session inserts `ticket` directly anymore.
drop policy if exists ticket_owner_insert on public.ticket;
revoke insert on public.ticket from authenticated, anon;
