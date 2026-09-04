-- Product decision (2026-09-04, BIZ-001 in docs/audit/01-limitations-register.md):
-- Abonten allows a customer to purchase multiple tickets for the same
-- event, including multiple ticket types, limited only by each ticket
-- type's own configured `quantity` (and the app-layer per-order caps in
-- @abonten/core/checkoutLimits). There is no global "one ticket per event
-- per user" rule.
--
-- create_ticket_checkout (migration 20260907094000) had a defensive re-check
-- inside the transaction that blocked a new checkout whenever the caller
-- already held an active/used ticket for the event — mirroring the same
-- guard that validateCheckoutCore and generateTicket ran in application
-- code (both already removed in this pass). This migration drops the RPC's
-- copy of that check; every other invariant it enforces (price-match,
-- inventory quantity, promo max_uses, one-pending-checkout-per-event) is
-- unchanged.
--
-- Pulled the live definition via pg_get_functiondef before editing — no
-- drift from the local 20260907094000 migration.

create or replace function public.create_ticket_checkout(
  p_user_id uuid,
  p_event_id uuid,
  p_occurrence_id uuid,
  p_promo_code_id uuid,
  p_promo_code_text text,
  p_expires_at timestamptz,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_checkout_session_id uuid := gen_random_uuid();
  v_line jsonb;
  v_total_discounted_units integer := 0;
  v_times_used integer;
  v_max_uses integer;
  v_updated_qty integer;
  v_current_price numeric;
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

  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Please select at least one ticket.'
      using errcode = 'check_violation';
  end if;

  -- Reserve every line's inventory with one atomic UPDATE each (no
  -- read-then-write window) and confirm the price hasn't moved since it
  -- was quoted to the buyer.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    update public.ticket_type
    set quantity = quantity - (v_line->>'quantity')::integer
    where id = (v_line->>'ticket_type_id')::uuid
      and (quantity is null or quantity >= (v_line->>'quantity')::integer)
      and abs(price - (v_line->>'unit_price')::numeric) < 0.01
    returning quantity into v_updated_qty;

    if not found then
      select price into v_current_price
      from public.ticket_type
      where id = (v_line->>'ticket_type_id')::uuid;

      if v_current_price is null then
        raise exception 'Ticket of type % not found', v_line->>'ticket_type_id'
          using errcode = 'no_data_found';
      end if;

      if v_current_price is distinct from (v_line->>'unit_price')::numeric then
        raise exception 'Ticket price has changed. Please review your order.'
          using errcode = 'check_violation';
      end if;

      raise exception 'That ticket is no longer available.'
        using errcode = 'check_violation';
    end if;

    v_total_discounted_units := v_total_discounted_units
      + coalesce((v_line->>'discounted_units')::integer, 0);
  end loop;

  -- Promo claim: the same invariant claimPromoUsage enforces (max_uses cap,
  -- one usage row per user per event), applied inside this transaction's
  -- row lock instead of a CAS retry loop — which allocation to give each
  -- line was already decided in JS (checkoutPricing.allocatePromoEligibility)
  -- and is trusted here, only the aggregate cap is re-checked.
  if p_promo_code_id is not null and v_total_discounted_units > 0 then
    select times_used, max_uses into v_times_used, v_max_uses
    from public.promo_code
    where id = p_promo_code_id
    for update;

    if not found then
      raise exception 'Promo code no longer exists'
        using errcode = 'check_violation';
    end if;

    if v_max_uses is not null and v_times_used + v_total_discounted_units > v_max_uses then
      raise exception 'Promo code has reached its usage limit!'
        using errcode = 'check_violation';
    end if;

    begin
      insert into public.promo_code_usage (promo_code_id, user_id, event_id)
      values (p_promo_code_id, p_user_id, p_event_id);
    exception when unique_violation then
      raise exception 'You have already used this promo code'
        using errcode = 'check_violation';
    end;

    update public.promo_code
    set times_used = times_used + v_total_discounted_units
    where id = p_promo_code_id;
  end if;

  begin
    insert into public.ticket_checkout (
      checkout_session_id, user_id, event_id, ticket_type_id, quantity,
      unit_price, promo_code, discount, discounted_units, total_price,
      status, expires_at, occurrence_id
    )
    select
      v_checkout_session_id,
      p_user_id,
      p_event_id,
      (l->>'ticket_type_id')::uuid,
      (l->>'quantity')::integer,
      (l->>'unit_price')::numeric,
      p_promo_code_text,
      (l->>'discount')::numeric,
      coalesce((l->>'discounted_units')::integer, 0),
      (l->>'amount')::numeric,
      'pending',
      p_expires_at,
      p_occurrence_id
    from jsonb_array_elements(p_lines) l;
  exception when unique_violation then
    raise exception 'You already have a pending ticket checkout for this event'
      using errcode = 'unique_violation';
  end;

  return v_checkout_session_id;
end;
$$;

revoke execute on function public.create_ticket_checkout(
  uuid, uuid, uuid, uuid, text, timestamptz, jsonb
) from public, anon;

grant execute on function public.create_ticket_checkout(
  uuid, uuid, uuid, uuid, text, timestamptz, jsonb
) to authenticated, service_role;
