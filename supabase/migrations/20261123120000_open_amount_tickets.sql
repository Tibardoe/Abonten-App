-- Open-amount tickets: the buyer chooses the amount (2026-11-23, the
-- founder's decision of 23 Nov 2026; PROJECT.md §92,
-- docs/architecture/open-amount-tickets.md).
--
-- An amusement park sells ride credits at its gate: visitors pay what they
-- want to load, get a card and spend it at the turnstile and the rides. On
-- Abonten the same is now a ticket type whose price the buyer types:
--
--   * `ticket_type.amount_mode` is 'fixed' (every existing type, the
--     default) or 'open'. An open type has `min_amount`, `max_amount` and
--     `amount_step` (major units of the event's currency): the buyer chooses
--     min, min + step, ... up to max. `price` holds the minimum, so every
--     "From GH₵X" already shown keeps working.
--   * One purchase is ONE ticket (one QR code) for the chosen amount. An
--     open type admits one person (admits = 1), is never a pass
--     (pass_shows) nor sells a seating section, and is never the FREE tier.
--   * Promo codes and group prices never apply to an open line; Pay small
--     small is never offered for one (ticket_plan_create refuses it).
--   * At the door the scanner shows the amount paid ("Paid GH₵150") so staff
--     load that many credits. The checkout line records that it was an
--     open-amount line (`ticket_checkout.open_amount`), as it records
--     `admits`, so the door reads the line, not the type as it is now.
--
-- The same mechanism serves "pay what you want (minimum X)" entry and table
-- deposits; what the amount buys is said by the type's one-line note
-- (ticket_type.description, PROJECT.md §90).
--
-- Organizers set it only when the feature flag tickets.open_amount is on for
-- their account (checked by @abonten/services, exactly like
-- tickets.group_pricing); the flag row below ships OFF. A listing already set
-- up keeps selling if the flag is turned off.
--
-- What changes here:
--   * the columns and their CHECKs; a trigger holds each amount to the
--     currency's decimals and the range to whole steps, counted in minor
--     units (public.major_to_minor);
--   * guard_ticket_type_amount: a client session cannot change how a type's
--     price is set once anything was bought or is being bought (as
--     guard_ticket_type_admits does for admits);
--   * create_ticket_checkout (made again whole, checked against its
--     fingerprint first: the same-day-sales version of 20261123090000) takes
--     an open line's amount in `unit_price` (= `amount`, quantity 1, no
--     discount), refuses an amount outside the range or off the steps, and
--     keeps the "Ticket price has changed" check for fixed lines;
--   * create_event and event_add_show write / copy the four columns, and
--     ticket_plan_create refuses an open line: each changed in place at a
--     named anchor (as 20261123091000 did), a missing anchor stops the
--     migration.
--
-- Unchanged on purpose: issue_tickets_for_checkout (one ticket per unit; a
-- ticket's share stays total_price / quantity = the amount), the per-ticket
-- refunds (_refund_amount reads that share), the expiry sweep (puts back
-- `quantity`, here 1), the service fee (added on top by the services from
-- platform_fee_config), the organizer's earning (the ticket price paid).

begin;

-- ---------------------------------------------------------------------------
-- Fingerprints (line endings ignored): the function made again whole below
-- must be the one this migration was written against.

do $fp$
declare
  r record;
begin
  for r in
    select * from (values
      ('create_ticket_checkout', '72896838112b17900d21710befa53867')
    ) as f(name, fingerprint)
  loop
    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = r.name
        and md5(replace(p.prosrc, chr(13), '')) = r.fingerprint
    ) then
      raise exception 'open_amount_tickets: public.% is not the definition this migration expects', r.name;
    end if;
  end loop;
end;
$fp$;

-- ===========================================================================
-- 1. The ticket type

alter table public.ticket_type
  add column amount_mode text not null default 'fixed',
  add column min_amount  numeric,
  add column max_amount  numeric,
  add column amount_step numeric;

alter table public.ticket_type
  add constraint ticket_type_amount_mode_check
    check (amount_mode in ('fixed', 'open'));

-- A fixed type has no range; an open type has all three, a positive
-- minimum, a maximum not below it, a positive step that reaches the maximum
-- in whole steps (the trigger below re-checks it in the currency's minor
-- units).
alter table public.ticket_type
  add constraint ticket_type_amount_range_check check (
    (amount_mode = 'fixed'
     and min_amount is null and max_amount is null and amount_step is null)
    or (amount_mode = 'open'
        and min_amount is not null and max_amount is not null and amount_step is not null
        and min_amount > 0
        and max_amount >= min_amount
        and amount_step > 0
        and mod(max_amount - min_amount, amount_step) = 0)
  );

-- An open type: its price is the minimum ("From GH₵X"), one ticket admits
-- one person, never a pass, never a seat, never the FREE tier.
alter table public.ticket_type
  add constraint ticket_type_open_amount_shape_check check (
    amount_mode <> 'open'
    or (price = min_amount
        and admits = 1
        and pass_shows is null
        and seating_section_id is null
        and type is distinct from 'FREE')
  );

comment on column public.ticket_type.amount_mode is
  '''fixed'' (the price) or ''open'' (the buyer chooses an amount from min_amount to max_amount in steps of amount_step; '
  'one ticket for that amount). @abonten/core/openAmountTickets; PROJECT.md §92.';
comment on column public.ticket_type.min_amount is
  'Open types: the lowest amount a buyer may choose (major units of the currency); price holds the same value.';
comment on column public.ticket_type.max_amount is
  'Open types: the highest amount a buyer may choose (major units); min_amount plus whole steps.';
comment on column public.ticket_type.amount_step is
  'Open types: the amounts go up in this step from min_amount (major units).';

-- Each amount has the currency's decimals at most, and the range is whole
-- steps, counted in the currency's minor units (pesewas; whole francs).
create or replace function public.ticket_type_amount_precision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.amount_mode = 'open' and new.currency is not null then
    if public.money_round(new.min_amount, new.currency) <> new.min_amount
       or public.money_round(new.max_amount, new.currency) <> new.max_amount
       or public.money_round(new.amount_step, new.currency) <> new.amount_step then
      raise exception 'A % amount can''t have more than % decimal places',
        new.currency, public.currency_minor_units(new.currency)
        using errcode = 'check_violation';
    end if;
    if mod(public.major_to_minor(new.max_amount - new.min_amount, new.currency),
           public.major_to_minor(new.amount_step, new.currency)) <> 0 then
      raise exception 'The highest amount must be the lowest amount plus whole steps.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_ticket_type_zz_amount_precision
  before insert or update of amount_mode, min_amount, max_amount, amount_step, currency
  on public.ticket_type
  for each row execute function public.ticket_type_amount_precision();

-- A client session (an organizer editing through the Data API) may not
-- change how a type's price is set once anyone has bought or is buying it.
-- The services replace ticket types only before the first confirmed ticket
-- anyway (updateEventTicketTypesCore).
create or replace function public.guard_ticket_type_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if (new.amount_mode, new.min_amount, new.max_amount, new.amount_step)
       is distinct from (old.amount_mode, old.min_amount, old.max_amount, old.amount_step)
     and exists (select 1 from public.ticket_checkout tc where tc.ticket_type_id = old.id) then
    raise exception 'How this ticket type''s price is chosen can''t change once it has been sold.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_guard_ticket_type_amount
  before update of amount_mode, min_amount, max_amount, amount_step
  on public.ticket_type
  for each row execute function public.guard_ticket_type_amount();

-- ===========================================================================
-- 2. The checkout line

alter table public.ticket_checkout
  add column open_amount boolean not null default false;

-- An open-amount line is one ticket at the amount chosen, never discounted.
alter table public.ticket_checkout
  add constraint ticket_checkout_open_amount_check check (
    not open_amount
    or (quantity = 1
        and admits = 1
        and coalesce(discount, 0) = 0
        and coalesce(discounted_units, 0) = 0
        and group_discount_percent is null
        and total_price = unit_price)
  );

comment on column public.ticket_checkout.open_amount is
  'The buyer chose this line''s amount (an open-amount ticket type): unit_price = total_price = the amount, one ticket. '
  'Written by create_ticket_checkout; the door shows the amount paid.';

-- ---------------------------------------------------------------------------
-- Paid checkout: create_ticket_checkout, the same-day-sales version
-- (20261123090000) with open lines.

CREATE OR REPLACE FUNCTION public.create_ticket_checkout(p_user_id uuid, p_event_id uuid, p_occurrence_id uuid, p_promo_code_id uuid, p_promo_code_text text, p_expires_at timestamp with time zone, p_lines jsonb)
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
  v_event_ends_at timestamptz;
  v_close_minutes integer;
  v_occ_count integer;
  v_on_sale boolean;
  v_shared_left integer;
  v_shared_requested integer;
  v_admits smallint;
  v_amount_mode text;
  v_min_amount numeric;
  v_max_amount numeric;
  v_amount_step numeric;
  v_type_currency text;
  v_chosen numeric;
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
  -- A session is on sale until public.event_session_sales_close_at: its
  -- start, or the event's sales_close_before_end_minutes before its end.
  select status, starts_at, ends_at, sales_close_before_end_minutes
    into v_event_status, v_event_starts_at, v_event_ends_at, v_close_minutes
  from public.event
  where id = p_event_id;

  if not found then
    raise exception 'No event found!' using errcode = 'no_data_found';
  end if;

  if exists (select 1 from public.event pe where pe.id = p_event_id and pe.postponed_at is not null) then
    raise exception 'This event is postponed. Tickets go on sale again when it has a new date.'
      using errcode = 'check_violation';
  end if;

  if v_event_status is distinct from 'published' then
    raise exception 'This event is not currently on sale.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_occ_count
  from public.event_occurrence
  where event_id = p_event_id;

  if v_occ_count > 0 then
    v_on_sale := exists (
      select 1 from public.event_occurrence o
      where o.event_id = p_event_id
        and public.event_session_sales_close_at(o.starts_at, o.ends_at, v_close_minutes) > now()
    );
  else
    v_on_sale := coalesce(
      public.event_session_sales_close_at(v_event_starts_at, v_event_ends_at, v_close_minutes) > now(),
      false
    );
  end if;

  if not v_on_sale then
    raise exception 'This event is not open for ticket sales.'
      using errcode = 'check_violation';
  end if;

  if p_occurrence_id is not null then
    if not exists (
      select 1 from public.event_occurrence o
      where o.id = p_occurrence_id
        and o.event_id = p_event_id
        and public.event_session_sales_close_at(o.starts_at, o.ends_at, v_close_minutes) > now()
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

  -- ---- Shared-capacity pre-check (people) -------------------------------
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
    -- A line is a whole number of purchases of a type of THIS event: the
    -- service sends tickets (people), which must divide by the type's
    -- admits.
    select t.admits, t.amount_mode, t.min_amount, t.max_amount, t.amount_step, t.currency
      into v_admits, v_amount_mode, v_min_amount, v_max_amount, v_amount_step, v_type_currency
    from public.ticket_type t
    where t.id = (v_line->>'ticket_type_id')::uuid
      and t.event_id = p_event_id;

    if v_admits is null then
      raise exception 'Ticket of type % not found', v_line->>'ticket_type_id'
        using errcode = 'no_data_found';
    end if;

    if (v_line->>'quantity')::integer <= 0
       or (v_line->>'quantity')::integer % v_admits <> 0 then
      raise exception 'Ticket data mismatch for type %', v_line->>'ticket_type_id'
        using errcode = 'check_violation';
    end if;

    if v_amount_mode = 'open' then
      -- An amount the buyer chose (open-amount tickets): one ticket of that
      -- amount, never discounted. unit_price and amount both carry it.
      v_chosen := (v_line->>'unit_price')::numeric;

      if (v_line->>'quantity')::integer <> 1
         or coalesce((v_line->>'discount')::numeric, 0) <> 0
         or coalesce((v_line->>'discounted_units')::integer, 0) <> 0
         or coalesce((v_line->>'group_discount_percent')::integer, 0) <> 0
         or (v_line->>'amount')::numeric is distinct from v_chosen then
        raise exception 'Ticket data mismatch for type %', v_line->>'ticket_type_id'
          using errcode = 'check_violation';
      end if;

      if v_chosen is null
         or v_chosen < v_min_amount
         or v_chosen > v_max_amount
         or public.money_round(v_chosen, v_type_currency) <> v_chosen
         or mod(public.major_to_minor(v_chosen - v_min_amount, v_type_currency),
                public.major_to_minor(v_amount_step, v_type_currency)) <> 0 then
        raise exception 'Choose an amount from % to %, in steps of %.',
          public.money_text(public.major_to_minor(v_min_amount, v_type_currency), v_type_currency),
          public.money_text(public.major_to_minor(v_max_amount, v_type_currency), v_type_currency),
          public.money_text(public.major_to_minor(v_amount_step, v_type_currency), v_type_currency)
          using errcode = 'check_violation';
      end if;

      -- The range read above is still the type's (an organizer may not
      -- change it once this line exists).
      update public.ticket_type
      set quantity = quantity - 1
      where id = (v_line->>'ticket_type_id')::uuid
        and amount_mode = 'open'
        and min_amount = v_min_amount
        and max_amount = v_max_amount
        and amount_step = v_amount_step
        and (quantity is null or quantity >= 1)
      returning quantity into v_updated_qty;

      if not found then
        if exists (
          select 1 from public.ticket_type t
          where t.id = (v_line->>'ticket_type_id')::uuid
            and (t.amount_mode is distinct from 'open'
                 or t.min_amount is distinct from v_min_amount
                 or t.max_amount is distinct from v_max_amount
                 or t.amount_step is distinct from v_amount_step)
        ) then
          raise exception 'Ticket price has changed. Please review your order.'
            using errcode = 'check_violation';
        end if;

        raise exception 'That ticket is no longer available.'
          using errcode = 'check_violation';
      end if;
    else
      update public.ticket_type
      set quantity = quantity - (v_line->>'quantity')::integer
      where id = (v_line->>'ticket_type_id')::uuid
        and amount_mode = 'fixed'
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

        if v_current_price is distinct from (v_line->>'unit_price')::numeric
           or exists (
             select 1 from public.ticket_type t
             where t.id = (v_line->>'ticket_type_id')::uuid
               and t.amount_mode is distinct from 'fixed'
           ) then
          raise exception 'Ticket price has changed. Please review your order.'
            using errcode = 'check_violation';
        end if;

        raise exception 'That ticket is no longer available.'
          using errcode = 'check_violation';
      end if;

      v_total_discounted_units := v_total_discounted_units
        + coalesce((v_line->>'discounted_units')::integer, 0);
    end if;
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
      status, expires_at, occurrence_id, admits, group_discount_percent,
      open_amount
    )
    select
      v_checkout_session_id,
      p_user_id,
      p_event_id,
      (l->>'ticket_type_id')::uuid,
      (l->>'quantity')::integer,
      (l->>'unit_price')::numeric,
      -- An open line is never discounted, so it carries no code.
      case when t.amount_mode = 'open' then null else p_promo_code_text end,
      case when t.amount_mode = 'open' then 0 else (l->>'discount')::numeric end,
      case when t.amount_mode = 'open' then 0
           else coalesce((l->>'discounted_units')::integer, 0) end,
      (l->>'amount')::numeric,
      'pending',
      p_expires_at,
      p_occurrence_id,
      t.admits,
      case when t.amount_mode = 'open' then null
           else nullif((l->>'group_discount_percent')::integer, 0) end,
      t.amount_mode = 'open'
    from jsonb_array_elements(p_lines) l
    join public.ticket_type t on t.id = (l->>'ticket_type_id')::uuid;
  exception when unique_violation then
    raise exception 'That ticket is already in your order.'
      using errcode = 'unique_violation';
  end;

  return v_checkout_session_id;
end;
$function$;

-- ===========================================================================
-- 3. The functions that write or copy ticket types, and Pay small small,
--    changed in place at a named anchor.

do $tickets$
declare
  v_fn  regprocedure;
  v_def text;
  v_new text;
begin
  -- create_event: how each ticket type it is given is priced.
  select p.oid::regprocedure into strict v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_event';
  v_def := replace(pg_get_functiondef(v_fn), chr(13), '');
  v_new := replace(v_def,
$a$    insert into ticket_type (event_id, type, price, currency, quantity, available_from, available_until, admits, description)$a$,
$b$    insert into ticket_type (event_id, type, price, currency, quantity, available_from, available_until, admits, description,
                             amount_mode, min_amount, max_amount, amount_step)$b$);
  v_new := replace(v_new,
$a$      nullif(btrim(elem->>'description'), '')
    from jsonb_array_elements(p_ticket_types) elem;$a$,
$b$      nullif(btrim(elem->>'description'), ''),
      -- Fixed, or an amount the buyer chooses (@abonten/core/openAmountTickets).
      coalesce(nullif(elem->>'amount_mode', ''), 'fixed'),
      nullif(elem->>'min_amount', '')::numeric,
      nullif(elem->>'max_amount', '')::numeric,
      nullif(elem->>'amount_step', '')::numeric
    from jsonb_array_elements(p_ticket_types) elem;$b$);
  if v_new not like '%amount_mode, min_amount, max_amount, amount_step)%'
     or v_new not like '%nullif(elem->>''amount_step'', '''')::numeric%' then
    raise exception 'open_amount_tickets: the ticket types of create_event were not found';
  end if;
  execute v_new;

  -- event_add_show: a run's new show (or a copy) keeps how each type is
  -- priced.
  select p.oid::regprocedure into strict v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'event_add_show';
  v_def := replace(pg_get_functiondef(v_fn), chr(13), '');
  v_new := replace(v_def,
$a$    event_id, type, price, currency, quantity, admits, available_from, available_until, pass_shows,
    seating_section_id, description
  )$a$,
$b$    event_id, type, price, currency, quantity, admits, available_from, available_until, pass_shows,
    seating_section_id, description, amount_mode, min_amount, max_amount, amount_step
  )$b$);
  v_new := replace(v_new,
$a$    case when v_moved then null else tt.seating_section_id end,
    tt.description
  from public.ticket_type tt$a$,
$b$    case when v_moved then null else tt.seating_section_id end,
    tt.description,
    tt.amount_mode,
    tt.min_amount,
    tt.max_amount,
    tt.amount_step
  from public.ticket_type tt$b$);
  if v_new not like '%seating_section_id, description, amount_mode, min_amount, max_amount, amount_step%'
     or v_new not like '%tt.amount_step%' then
    raise exception 'open_amount_tickets: the ticket types of event_add_show were not found';
  end if;
  execute v_new;

  -- ticket_plan_create: an amount the buyer chooses is paid at once, never
  -- small small.
  select p.oid::regprocedure into strict v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'ticket_plan_create';
  v_def := replace(pg_get_functiondef(v_fn), chr(13), '');
  v_new := replace(v_def,
$a$       or coalesce(t.type, '') = 'FREE'
  ) then
    raise exception 'ticket_plan_create: unpaid ticket' using errcode = 'check_violation';
  end if;$a$,
$b$       or coalesce(t.type, '') = 'FREE'
  ) then
    raise exception 'ticket_plan_create: unpaid ticket' using errcode = 'check_violation';
  end if;

  -- An amount the buyer chooses (open-amount tickets) is paid at once.
  if exists (
    select 1
    from jsonb_array_elements(p_lines) l
    join public.ticket_type t on t.id = (l->>'ticket_type_id')::uuid
    where t.amount_mode = 'open'
  ) then
    raise exception 'ticket_plan_create: open amount' using errcode = 'check_violation';
  end if;$b$);
  if v_new not like '%ticket_plan_create: open amount%' then
    raise exception 'open_amount_tickets: the ticket check of ticket_plan_create was not found';
  end if;
  execute v_new;
end;
$tickets$;

-- ===========================================================================
-- 4. The switch (off; staff turn it on per organizer in Admin > Markets >
--    Feature flags, as tickets.group_pricing)

insert into public.feature_flag (key, description, enabled, rules) values
  ('tickets.open_amount',
   'Ticket types whose amount the buyer chooses (a minimum, a maximum and a step; one ticket for the amount), for the organizers it is on for (allowSubjects: their account or team id)',
   false,
   '{"allowSubjects": [], "percent": 0}'::jsonb)
on conflict (key) do nothing;

-- ===========================================================================
-- 5. Checks

do $$
begin
  if exists (select 1 from public.ticket_type where amount_mode <> 'fixed') then
    raise exception 'migration check: every existing ticket type stays fixed';
  end if;
  if exists (select 1 from public.ticket_checkout where open_amount) then
    raise exception 'migration check: no existing checkout line is an open amount';
  end if;
  if has_function_privilege('authenticated', 'public.create_ticket_checkout(uuid, uuid, uuid, uuid, text, timestamp with time zone, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.create_ticket_checkout(uuid, uuid, uuid, uuid, text, timestamp with time zone, jsonb)', 'execute') then
    raise exception 'migration check: create_ticket_checkout must stay service role only';
  end if;
  if (select prosrc from pg_proc where proname = 'create_ticket_checkout') not like '%open_amount%' then
    raise exception 'migration check: create_ticket_checkout does not record open lines';
  end if;
  if (select prosrc from pg_proc where proname = 'create_event') not like '%amount_step%'
     or (select prosrc from pg_proc where proname = 'event_add_show') not like '%tt.amount_step%'
     or (select prosrc from pg_proc where proname = 'ticket_plan_create') not like '%open amount%' then
    raise exception 'migration check: a ticket type function was not changed';
  end if;
  if not exists (select 1 from public.feature_flag where key = 'tickets.open_amount') then
    raise exception 'migration check: the tickets.open_amount flag is missing';
  end if;
end;
$$;

commit;
