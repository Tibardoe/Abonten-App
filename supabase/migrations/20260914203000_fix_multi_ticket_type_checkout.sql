-- Multi-ticket-type checkout was impossible.
--
-- 20260904134536_create_ticket_checkout_rpc.sql added
--   unique index ticket_checkout_one_pending_per_user_event
--     on ticket_checkout (user_id, event_id) where status = 'pending'
-- to enforce "at most one pending checkout per (user, event)".
--
-- But create_ticket_checkout writes ONE ROW PER TICKET TYPE in the order --
-- every row carrying the same user_id, event_id and status 'pending'. So the
-- index also rejected the SECOND LINE of a single order: any basket mixing
-- two tiers (a Regular and a VIP, say) aborted the whole transaction and the
-- shopper was told "You already have a pending ticket checkout for this
-- event" -- a message that was both wrong and unactionable, since no such
-- checkout existed. Single-tier orders were unaffected, which is why this
-- went unnoticed. Confirmed on device 2026-09-14: 2 tiers -> 409, 1 tier -> 200.
--
-- The invariant itself is still worth enforcing, it just has to be scoped to
-- the checkout SESSION rather than the row. A partial unique index cannot
-- express "same session is fine, a different session is not" without
-- btree_gist (not installed here), so the rule moves into the function,
-- serialised by a transaction-scoped advisory lock on (user, event) so it
-- stays as atomic against concurrent callers as the index was.
--
-- The replacement index keeps a narrower backstop: the same ticket type can
-- never appear twice among a user's pending rows for one event.

begin;

drop index if exists public.ticket_checkout_one_pending_per_user_event;

create unique index if not exists ticket_checkout_one_pending_line_per_type
  on public.ticket_checkout (user_id, event_id, ticket_type_id)
  where status = 'pending';

create or replace function public.create_ticket_checkout(p_user_id uuid, p_event_id uuid, p_occurrence_id uuid, p_promo_code_id uuid, p_promo_code_text text, p_expires_at timestamp with time zone, p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller uuid := auth.uid();
  v_checkout_session_id uuid := gen_random_uuid();
  v_line jsonb;
  v_total_discounted_units integer := 0;
  v_times_used integer;
  v_max_uses integer;
  v_updated_qty integer;
  v_current_price numeric;
  v_event_status text;
  v_event_starts_at timestamptz;
  v_occ_count integer;
  v_has_future boolean;
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

  -- ---- Sales-window guard (server clock is authoritative) -------------
  select status, starts_at
    into v_event_status, v_event_starts_at
  from public.event
  where id = p_event_id;

  if not found then
    raise exception 'No event found!' using errcode = 'no_data_found';
  end if;

  if v_event_status is distinct from 'published' then
    raise exception 'This event is not currently on sale.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_occ_count
  from public.event_occurrence
  where event_id = p_event_id;

  if v_occ_count > 0 then
    v_has_future := exists (
      select 1 from public.event_occurrence
      where event_id = p_event_id
        and starts_at > now()
    );
  else
    v_has_future := v_event_starts_at is not null
      and v_event_starts_at > now();
  end if;

  if not v_has_future then
    raise exception 'This event is not open for ticket sales.'
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

  -- ---- One pending checkout SESSION per (user, event) ------------------
  -- Replaces the unique index that used to enforce this, which could not
  -- tell a second LINE of this order from a second ORDER (see header). The
  -- advisory lock is transaction-scoped and serialises concurrent callers
  -- for the same (user, event), so two simultaneous attempts cannot both
  -- pass the EXISTS below. Deliberately placed BEFORE the reservation loop
  -- so a rejected attempt never touches ticket_type.quantity at all.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_event_id::text, 0)
  );

  if exists (
    select 1
    from public.ticket_checkout
    where user_id = p_user_id
      and event_id = p_event_id
      and status = 'pending'
  ) then
    raise exception 'You already have a pending ticket checkout for this event'
      using errcode = 'unique_violation';
  end if;
  -- -------------------------------------------------------------------

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
    -- Now only reachable if the SAME ticket type appears twice in p_lines
    -- (ticket_checkout_one_pending_line_per_type) -- a malformed basket.
    raise exception 'That ticket is already in your order.'
      using errcode = 'unique_violation';
  end;

  return v_checkout_session_id;
end;
$function$;

commit;
