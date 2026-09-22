-- Event capacity and free-event promo codes, enforced by the database.
--
-- Two business rules that every client form and every service function
-- already checks (@abonten/core/ticketCapacity, @abonten/core/ticketTiers)
-- but nothing in the database enforced, so a caller that skipped the
-- service could still create an invalid state:
--
-- 1. CAPACITY. `event.capacity` is the headcount cap for the whole event.
--    `ticket_type.quantity` is the REMAINING stock of one ticket type (a
--    reservation decrements it, an expiry / cancellation puts it back), and
--    null means that type has no stock limit of its own. The rule is
--
--        seats taken + stock still reserved for ticket types with a quantity
--          <= capacity
--
--    where "seats taken" = attendance still 'attending' (sum of
--    number_of_tickets — the same figure get_event_attendance_count reports)
--    + every 'pending' ticket_checkout line (a held seat is a seat). Ticket
--    types without a quantity draw on whatever that leaves over — one shared
--    pool — so two "unlimited" types can never add up to more than the
--    capacity between them, and a type WITH a quantity keeps its seats.
--
--    Until now `create_ticket_checkout` only guarded each type's own stock:
--    an event with capacity 100 and two types without quantities could sell
--    100 of each.
--
--    Enforcement: one deferred CONSTRAINT trigger per table whose rows move
--    the inequality — ticket_checkout (a reservation), attendance (a seat
--    taken), ticket_type (stock set or raised) and event (capacity changed).
--    Deferred, because the paths that keep the inequality balanced do so
--    across several statements in one transaction (issue_tickets_for_checkout
--    inserts attendance BEFORE flipping the checkout off 'pending';
--    expire_stale_ticket_checkouts restores stock and flips the row in one
--    function) and an immediate trigger would see the intermediate state.
--    The check serialises per event with a transaction-scoped advisory
--    lock — never a row lock on `event`, so it cannot form a cycle with the
--    row locks the checkout, sweep and edit paths already hold.
--
--    A ticket_type UPDATE that RAISES stock is checked only for a client
--    session (an organizer editing directly through PostgREST). The
--    backend's own restocks — the service-role compensation in
--    ticketInventory.ts and cancelUserTicketCore, which run in a separate
--    request from the status flip they pair with — are trusted, as is
--    every SECURITY DEFINER function (they run as their owner). A decrement
--    can never break the rule and is skipped.
--
--    `create_ticket_checkout` also gains a friendly pre-check so the
--    common case fails early with "Only N spots are left" instead of at
--    commit; the trigger stays the race-safe backstop.
--
-- 2. FREE EVENTS HAVE NO PROMO CODES. A promo code discounts a ticket price
--    and the FREE tier has none. An active promo_code and a FREE ticket_type
--    may never coexist on one event: inserting or re-activating a code on a
--    free event is refused, and so is inserting the FREE tier while an
--    active code exists (the service retires the codes first: unused ones
--    deleted, used ones deactivated so their redemption history stays).
--    Existing active codes on free events are deactivated below — they were
--    unusable anyway, free events never reach checkout.

begin;

-- ---------------------------------------------------------------------
-- 1. Capacity
-- ---------------------------------------------------------------------

-- SECURITY DEFINER: attendance and ticket_checkout are RLS-restricted to
-- their owners, and the check must see every row for the event whoever
-- the caller is. Reads only; raises check_violation with an
-- organizer-facing message when the rule is broken.
create or replace function public.event_capacity_check(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity integer;
  v_taken integer;
  v_reserved integer;
begin
  select capacity into v_capacity from public.event where id = p_event_id;
  if v_capacity is null then
    return;
  end if;

  -- Serialise concurrent checks for this event. Transaction-scoped, so it
  -- is held until commit and every later checker sees this one's rows.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('event_capacity:' || p_event_id::text, 0)
  );

  select
    coalesce((select sum(a.number_of_tickets)
              from public.attendance a
              where a.event_id = p_event_id and a.status = 'attending'), 0)
    + coalesce((select sum(c.quantity)
                from public.ticket_checkout c
                where c.event_id = p_event_id and c.status = 'pending'), 0)
  into v_taken;

  select coalesce(sum(t.quantity), 0) into v_reserved
  from public.ticket_type t
  where t.event_id = p_event_id and t.quantity is not null;

  if v_taken + v_reserved > v_capacity then
    if v_taken = 0 then
      raise exception 'Ticket quantities total %, which exceeds the event capacity of %.',
        v_reserved, v_capacity
        using errcode = 'check_violation';
    end if;
    raise exception 'Not enough spots are left for this event.'
      using errcode = 'check_violation';
  end if;
end;
$$;

-- Called from the trigger as whoever fired it (a signed-in organizer or
-- buyer, the service role, or a SECURITY DEFINER function's owner).
revoke all on function public.event_capacity_check(uuid) from public, anon;
grant execute on function public.event_capacity_check(uuid) to authenticated, service_role;

-- Seats still open to ticket types WITHOUT a quantity (the shared pool), or
-- null when the event has no capacity. Used by create_ticket_checkout's
-- early check and handy for reporting. Read-only, no lock.
create or replace function public.event_shared_capacity_left(p_event_id uuid)
returns integer
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when e.capacity is null then null
    else e.capacity
      - coalesce((select sum(a.number_of_tickets)
                  from public.attendance a
                  where a.event_id = e.id and a.status = 'attending'), 0)
      - coalesce((select sum(c.quantity)
                  from public.ticket_checkout c
                  where c.event_id = e.id and c.status = 'pending'), 0)
      - coalesce((select sum(t.quantity)
                  from public.ticket_type t
                  where t.event_id = e.id and t.quantity is not null), 0)
  end
  from public.event e
  where e.id = p_event_id;
$$;

revoke all on function public.event_shared_capacity_left(uuid) from public, anon;
grant execute on function public.event_shared_capacity_left(uuid) to authenticated, service_role;

-- The trigger body. Not SECURITY DEFINER itself, so `current_user` is the
-- caller's role for the ticket_type stock-raise rule; the check it calls is.
create or replace function public.enforce_event_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  if tg_table_name = 'event' then
    v_event_id := new.id;
  else
    v_event_id := new.event_id;
  end if;

  if tg_table_name = 'ticket_type' and tg_op = 'UPDATE' then
    -- A decrement (a reservation) can never break the rule.
    if old.quantity is not null
       and (new.quantity is null or new.quantity <= old.quantity) then
      return null;
    end if;
    -- A raise: a client session is an organizer changing the configuration
    -- and is checked. The backend's own restocks (service_role) and every
    -- SECURITY DEFINER sweep (owner) are trusted — see the header.
    if current_user not in ('authenticated', 'anon') then
      return null;
    end if;
  end if;

  perform public.event_capacity_check(v_event_id);
  return null;
end;
$$;

drop trigger if exists trg_event_capacity_on_checkout on public.ticket_checkout;
create constraint trigger trg_event_capacity_on_checkout
  after insert or update of quantity, status on public.ticket_checkout
  deferrable initially deferred
  for each row
  when (new.status = 'pending')
  execute function public.enforce_event_capacity();

drop trigger if exists trg_event_capacity_on_attendance on public.attendance;
create constraint trigger trg_event_capacity_on_attendance
  after insert or update of status, number_of_tickets on public.attendance
  deferrable initially deferred
  for each row
  when (new.status = 'attending')
  execute function public.enforce_event_capacity();

drop trigger if exists trg_event_capacity_on_ticket_type on public.ticket_type;
create constraint trigger trg_event_capacity_on_ticket_type
  after insert or update of quantity on public.ticket_type
  deferrable initially deferred
  for each row
  when (new.quantity is not null)
  execute function public.enforce_event_capacity();

drop trigger if exists trg_event_capacity_on_event on public.event;
create constraint trigger trg_event_capacity_on_event
  after update of capacity on public.event
  deferrable initially deferred
  for each row
  when (new.capacity is not null)
  execute function public.enforce_event_capacity();

-- ---------------------------------------------------------------------
-- 2. Free events have no promo codes
-- ---------------------------------------------------------------------

create or replace function public.guard_promo_code_free_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'promo_code' then
    -- Only an insert, a re-activation or a move to another event can put
    -- an ACTIVE code on a free event; edits to an inactive code and the
    -- checkout's times_used bump pass through.
    if new.is_active
       and (tg_op = 'INSERT'
            or not old.is_active
            or new.event_id is distinct from old.event_id)
       and exists (select 1 from public.ticket_type t
                   where t.event_id = new.event_id and t.type = 'FREE') then
      raise exception 'Promo codes aren''t available on a free event. Remove them, or make the event paid.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- ticket_type: the FREE tier arriving while an active code exists.
  if new.type = 'FREE'
     and exists (select 1 from public.promo_code p
                 where p.event_id = new.event_id and p.is_active) then
    raise exception 'This event still has active promo codes. Remove or deactivate them before making it free.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_promo_code_free_event on public.promo_code;
create trigger trg_promo_code_free_event
  before insert or update of is_active, event_id on public.promo_code
  for each row
  execute function public.guard_promo_code_free_event();

drop trigger if exists trg_ticket_type_free_event_promo on public.ticket_type;
create trigger trg_ticket_type_free_event_promo
  before insert or update of type, event_id on public.ticket_type
  for each row
  when (new.type = 'FREE')
  execute function public.guard_promo_code_free_event();

-- Existing data: an active code on a free event was never redeemable
-- (free events never reach checkout). Deactivate rather than delete so any
-- history stays. The column guard on promo_code (promo_code_protect_columns)
-- only lets the event's organizer (auth.uid()) change a code's terms, and a
-- migration has no auth.uid(), so the table's user triggers are switched off
-- for this one statement and back on straight after.
alter table public.promo_code disable trigger user;
update public.promo_code p
set is_active = false
where p.is_active
  and exists (select 1 from public.ticket_type t
              where t.event_id = p.event_id and t.type = 'FREE');
alter table public.promo_code enable trigger user;

-- ---------------------------------------------------------------------
-- 3. create_ticket_checkout: fail early and clearly on the shared pool
-- ---------------------------------------------------------------------
-- Same body as 20260914203000_fix_multi_ticket_type_checkout.sql plus the
-- block marked "Shared-capacity pre-check". The deferred trigger above is
-- what makes the rule race-safe; this only turns the common case into a
-- message before any stock is touched.

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
  v_shared_left integer;
  v_shared_requested integer;
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

  -- ---- Shared-capacity pre-check ---------------------------------------
  -- Lines for ticket types WITHOUT a quantity draw on the event's shared
  -- pool (capacity minus seats taken minus stock reserved for the types
  -- WITH a quantity). Lines for types with a quantity are bounded by that
  -- stock in the loop below. Unlocked and therefore best-effort: the
  -- deferred capacity trigger is what makes this race-safe at commit.
  v_shared_left := public.event_shared_capacity_left(p_event_id);
  if v_shared_left is not null then
    select coalesce(sum((l->>'quantity')::integer), 0)
      into v_shared_requested
    from jsonb_array_elements(p_lines) l
    join public.ticket_type t on t.id = (l->>'ticket_type_id')::uuid
    where t.quantity is null;

    if v_shared_requested > v_shared_left then
      if v_shared_left <= 0 then
        raise exception 'This event is sold out.'
          using errcode = 'check_violation';
      end if;
      raise exception 'Only % % left for this event.',
        v_shared_left, case when v_shared_left = 1 then 'spot is' else 'spots are' end
        using errcode = 'check_violation';
    end if;
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
    raise exception 'That ticket is already in your order.'
      using errcode = 'unique_violation';
  end;

  return v_checkout_session_id;
end;
$function$;

commit;
