-- Phase 2 (FIN-001, FIN-002, ARCH-001): make paid ticket issuance atomic.
--
-- Before this, apps/web/src/utils/generateTicket.ts issued tickets as a
-- sequence of independent PostgREST calls (ticket insert -> attendance
-- insert -> ticket_checkout='paid' -> record_organizer_earning), none of
-- which shared a transaction. A failure between steps could:
--   * leave tickets that consume stock against a still-'pending' checkout
--     that the expiry sweep then restocks (silent oversell);
--   * skip record_organizer_earning entirely (silent organizer underpay);
--   * strand a retry forever, because generateTicket's "already bought"
--     guard returned a non-200 status the payment finalizer treats as a
--     failure (the reconciliation black hole).
--
-- This RPC does the whole DB mutation in one transaction and is idempotent:
-- a checkout that is already 'paid' returns its existing ticket ids instead
-- of erroring, so webhook/redelivery/retry all converge. QR generation and
-- the Cloudinary upload stay in generateTicket.ts (the only non-DB step);
-- the caller passes the finished {ticket_code, qr_public_id, qr_version}
-- tuples in p_tickets.
--
-- Safe to expose to `authenticated` (the client-verify fulfilment path runs
-- as the buyer): issuance for a paid checkout requires a matching
-- payment_attempt in processing/succeeded AND a successful `transaction` row
-- owned by the same user — neither of which a client can fabricate. A free
-- basket (p_transaction_id null) requires every checkout row to be
-- server-priced at exactly 0.

create or replace function public.issue_tickets_for_checkout(
  p_checkout_session_id uuid,
  p_user_id uuid,
  p_transaction_id uuid,
  p_metadata jsonb,
  p_ticket_expires_at timestamptz,
  p_tickets jsonb
)
returns table(ticket_id uuid, already_issued boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller     uuid := auth.uid();
  v_event_id   uuid;
  v_total_qty  integer;
  v_given_qty  integer;
  v_all_paid   boolean;
  v_any_pending boolean;
  v_locked_count integer;
  v_ticket_ids uuid[];
  v_row        record;
begin
  if p_user_id is null then
    raise exception 'user id is required';
  end if;

  -- An authenticated caller may only issue for itself. The service-role
  -- path (Paystack webhook) has no auth.uid() and has already resolved
  -- identity upstream.
  if v_caller is not null and v_caller <> p_user_id then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_ticket_expires_at is null then
    raise exception 'ticket expiry is required';
  end if;

  -- Lock every row of this checkout session so a concurrent issue or the
  -- expiry sweep cannot interleave with the state machine below.
  perform 1
  from public.ticket_checkout
  where checkout_session_id = p_checkout_session_id
    and user_id = p_user_id
  for update;

  select
    count(*),
    bool_and(status = 'paid'),
    bool_or(status = 'pending'),
    coalesce(sum(quantity) filter (where status = 'pending'), 0),
    (array_agg(event_id))[1]
  into v_locked_count, v_all_paid, v_any_pending, v_total_qty, v_event_id
  from public.ticket_checkout
  where checkout_session_id = p_checkout_session_id
    and user_id = p_user_id;

  if v_locked_count = 0 then
    raise exception 'Checkout not found' using errcode = 'no_data_found';
  end if;

  -- Idempotent success: already fully issued -> hand back the existing
  -- tickets so a redelivered webhook / user retry is a no-op.
  if v_all_paid then
    return query
      select t.id, true
      from public.ticket t
      join public.ticket_checkout tc on tc.id = t.ticket_checkout_id
      where tc.checkout_session_id = p_checkout_session_id
        and tc.user_id = p_user_id;
    return;
  end if;

  if not v_any_pending then
    raise exception 'This checkout has expired. Please start again.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.ticket_checkout
    where checkout_session_id = p_checkout_session_id
      and user_id = p_user_id
      and status not in ('pending')
  ) then
    raise exception 'This checkout is in an unexpected state.'
      using errcode = 'check_violation';
  end if;

  -- Authorize the issuance.
  if p_transaction_id is not null then
    if not exists (
      select 1 from public.payment_attempt pa
      where pa.checkout_session_id = p_checkout_session_id
        and pa.transaction_id = p_transaction_id
        and pa.status in ('processing', 'succeeded')
    ) or not exists (
      select 1 from public.transaction tr
      where tr.id = p_transaction_id
        and tr.status = 'successful'
        and tr.user_id = p_user_id
    ) then
      raise exception 'Payment not verified for this checkout'
        using errcode = '42501';
    end if;
  else
    if exists (
      select 1 from public.ticket_checkout
      where checkout_session_id = p_checkout_session_id
        and user_id = p_user_id
        and coalesce(total_price, 0) <> 0
    ) then
      raise exception 'This checkout requires payment.' using errcode = '42501';
    end if;
  end if;

  -- Validate the supplied ticket tuples against the reserved quantities:
  -- one tuple per reserved unit, matched by (checkout row, ticket type).
  select count(*) into v_given_qty from jsonb_array_elements(p_tickets);
  if v_given_qty <> v_total_qty then
    raise exception 'Ticket data mismatch (expected % units, got %)',
      v_total_qty, v_given_qty using errcode = 'check_violation';
  end if;

  for v_row in
    select id, ticket_type_id, quantity
    from public.ticket_checkout
    where checkout_session_id = p_checkout_session_id
      and user_id = p_user_id
      and status = 'pending'
  loop
    if (
      select count(*) from jsonb_array_elements(p_tickets) e
      where (e->>'checkout_id')::uuid = v_row.id
        and (e->>'ticket_type_id')::uuid = v_row.ticket_type_id
    ) <> v_row.quantity then
      raise exception 'Ticket data mismatch for checkout row %', v_row.id
        using errcode = 'check_violation';
    end if;
  end loop;

  -- Insert tickets + one attendance row each, atomically. Data-modifying
  -- CTEs always run to completion even when the outer query doesn't read
  -- their output, so `att` executes.
  with ins as (
    insert into public.ticket (
      user_id, ticket_type_id, ticket_checkout_id, occurrence_id,
      qr_public_id, qr_version, ticket_code, expires_at,
      transaction_id, metadata, status
    )
    select
      p_user_id,
      (e->>'ticket_type_id')::uuid,
      (e->>'checkout_id')::uuid,
      nullif(e->>'occurrence_id', '')::uuid,
      e->>'qr_public_id',
      e->>'qr_version',
      e->>'ticket_code',
      p_ticket_expires_at,
      p_transaction_id,
      coalesce(p_metadata, '{}'::jsonb),
      'active'
    from jsonb_array_elements(p_tickets) e
    returning id, ticket_type_id
  ),
  att as (
    insert into public.attendance (
      user_id, event_id, ticket_type_id, ticket_id, status, number_of_tickets
    )
    select p_user_id, v_event_id, ins.ticket_type_id, ins.id, 'attending', 1
    from ins
    returning 1
  )
  select array_agg(ins.id) into v_ticket_ids from ins;

  update public.ticket_checkout
  set status = 'paid', completed_at = now(), updated_at = now()
  where checkout_session_id = p_checkout_session_id
    and user_id = p_user_id
    and status = 'pending';

  -- Credit the organizer for each now-paid checkout row (paid purchases
  -- only). record_organizer_earning is idempotent and only acts on rows
  -- whose status is 'paid', which we just set.
  if p_transaction_id is not null then
    for v_row in
      select id from public.ticket_checkout
      where checkout_session_id = p_checkout_session_id
        and user_id = p_user_id
    loop
      perform public.record_organizer_earning(v_row.id);
    end loop;
  end if;

  return query select unnest(v_ticket_ids), false;
end;
$$;

revoke execute on function public.issue_tickets_for_checkout(
  uuid, uuid, uuid, jsonb, timestamptz, jsonb
) from public, anon;

grant execute on function public.issue_tickets_for_checkout(
  uuid, uuid, uuid, jsonb, timestamptz, jsonb
) to authenticated, service_role;
