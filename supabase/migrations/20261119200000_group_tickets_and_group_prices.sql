-- Group tickets and group prices (docs/architecture/group-tickets-and-prices.md).
--
-- 1. GROUP TICKETS (decision X39: "a ticket type can issue several tickets
--    per purchase; no ticket admits more than one person"). A ticket type
--    gets `admits`: how many people one purchase of it lets in. A "Couple"
--    type at GH¢500 with admits = 2 issues two tickets, each with its own
--    code, each admitting one person.
--
--    Every stored count stays a count of PEOPLE (tickets), so nothing that
--    counts seats, restocks, issues or refunds changes:
--      * ticket_type.quantity      - places left (people), as before;
--      * ticket_checkout.quantity  - tickets on the line (people), always a
--                                    whole number of purchases: quantity is
--                                    a multiple of the line's admits;
--      * ticket_checkout.admits    - the type's admits when it was bought;
--      * unit_price                - the price of ONE purchase (the couple),
--                                    so the line is worth
--                                    quantity / admits x unit_price - discount;
--      * a ticket's share of its payment stays total_price / quantity (half
--        a couple's price per ticket), which is what the per-ticket refund
--        functions already use.
--    Only the screens and the API inputs speak in purchases ("2 Couple
--    tickets"); the services multiply by admits.
--
-- 2. GROUP PRICES. An event may offer up to three automatic discounts by
--    the number of tickets in one order ("10 or more: 10% off"). They are
--    priced by the server (@abonten/core/checkoutPricing priceOrder) and
--    stored on each checkout line (group_discount_percent). A promo code and
--    a group price never add up: each ticket gets the larger of the two.
--
-- Both are organizer settings behind the feature flag tickets.group_pricing
-- (off; staff switch it on for chosen organizers in Admin > Markets >
-- Feature flags). Listings already configured keep selling if it is off.

begin;

-- ---------------------------------------------------------------------------
-- 1. ticket_type.admits
-- ---------------------------------------------------------------------------

alter table public.ticket_type
  add column if not exists admits smallint not null default 1;

alter table public.ticket_type
  drop constraint if exists ticket_type_admits_range;
alter table public.ticket_type
  add constraint ticket_type_admits_range check (admits between 1 and 20);

-- Free registration is one person per registration (issue_free_ticket).
alter table public.ticket_type
  drop constraint if exists ticket_type_free_admits_one;
alter table public.ticket_type
  add constraint ticket_type_free_admits_one check (type is distinct from 'FREE' or admits = 1);

comment on column public.ticket_type.admits is
  'People one purchase of this type lets in (a Couple type: 2). Each person gets their own ticket. quantity counts people, not purchases.';

-- A client session (an organizer editing through the Data API) may not
-- change how many people a type admits once anyone has bought or is buying
-- it: the stock and the checkout lines already count people at the old size.
create or replace function public.guard_ticket_type_admits()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.admits is distinct from old.admits
     and exists (select 1 from public.ticket_checkout tc where tc.ticket_type_id = old.id) then
    raise exception 'This ticket type has been sold, so the number of people it admits can no longer change.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_ticket_type_admits on public.ticket_type;
create trigger trg_guard_ticket_type_admits
  before update of admits on public.ticket_type
  for each row execute function public.guard_ticket_type_admits();

-- ---------------------------------------------------------------------------
-- 2. ticket_checkout: what each line was bought as
-- ---------------------------------------------------------------------------

alter table public.ticket_checkout
  add column if not exists admits smallint not null default 1,
  add column if not exists group_discount_percent smallint;

alter table public.ticket_checkout
  drop constraint if exists ticket_checkout_admits_whole;
alter table public.ticket_checkout
  add constraint ticket_checkout_admits_whole
  check (admits between 1 and 20 and quantity % admits = 0);

alter table public.ticket_checkout
  drop constraint if exists ticket_checkout_group_discount_range;
alter table public.ticket_checkout
  add constraint ticket_checkout_group_discount_range
  check (group_discount_percent is null or group_discount_percent between 1 and 90);

comment on column public.ticket_checkout.admits is
  'The ticket type''s admits when this line was bought; quantity / admits purchases at unit_price each.';
comment on column public.ticket_checkout.group_discount_percent is
  'The event''s group price applied to this line (% off), or null. Never added to a promo code: each ticket got the larger.';

-- ---------------------------------------------------------------------------
-- 3. event_group_discount
-- ---------------------------------------------------------------------------

create table if not exists public.event_group_discount (
  event_id     uuid        not null references public.event(id) on delete cascade,
  min_tickets  integer     not null check (min_tickets between 2 and 500),
  percent_off  integer     not null check (percent_off between 1 and 90),
  created_at   timestamptz not null default now(),
  primary key (event_id, min_tickets)
);

comment on table public.event_group_discount is
  'Automatic % off for orders of at least min_tickets tickets (up to 3 per event). Written by @abonten/services only.';

alter table public.event_group_discount enable row level security;

revoke all on table public.event_group_discount from anon, authenticated;
grant select on table public.event_group_discount to anon, authenticated;
grant all on table public.event_group_discount to service_role;

-- Same audience as the event's ticket types (ticket_type_select).
drop policy if exists event_group_discount_select on public.event_group_discount;
create policy event_group_discount_select on public.event_group_discount
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.event e
      where e.id = event_group_discount.event_id
        and e.status::text = any (array['published', 'canceled'])
    )
    or exists (
      select 1 from public.event e
      where e.id = event_group_discount.event_id
        and e.organizer_id = any ((select public.acting_accounts(array['events.manage', 'attendees.view', 'checkin.scan', 'promo.manage', 'money.view']))::uuid[])
    )
  );

create or replace function public.event_group_discount_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('event_group_discount:' || new.event_id::text, 0)
  );
  if (select count(*) from public.event_group_discount where event_id = new.event_id) >= 3 then
    raise exception 'An event can have at most 3 group prices.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_event_group_discount_limit on public.event_group_discount;
create trigger trg_event_group_discount_limit
  before insert on public.event_group_discount
  for each row execute function public.event_group_discount_limit();

-- ---------------------------------------------------------------------------
-- 4. create_ticket_checkout: whole purchases, the type's admits, the group
--    price on each line. Same body as 20260922120000 otherwise.
-- ---------------------------------------------------------------------------

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
  v_admits smallint;
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
    select t.admits into v_admits
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
      status, expires_at, occurrence_id, admits, group_discount_percent
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
      p_occurrence_id,
      t.admits,
      nullif((l->>'group_discount_percent')::integer, 0)
    from jsonb_array_elements(p_lines) l
    join public.ticket_type t on t.id = (l->>'ticket_type_id')::uuid;
  exception when unique_violation then
    raise exception 'That ticket is already in your order.'
      using errcode = 'unique_violation';
  end;

  return v_checkout_session_id;
end;
$function$;

revoke all on function public.create_ticket_checkout(uuid, uuid, uuid, uuid, text, timestamp with time zone, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_ticket_checkout(uuid, uuid, uuid, uuid, text, timestamp with time zone, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. create_event: a ticket type's admits (default 1). Same body as
--    20260924100100 otherwise.
-- ---------------------------------------------------------------------------

create or replace function public.create_event(
  p_client_request_id uuid, p_organizer_id uuid, p_title text, p_slug text, p_description text,
  p_event_code text, p_event_category text, p_event_type text[], p_latitude double precision,
  p_longitude double precision, p_address jsonb, p_capacity integer, p_website_url text,
  p_flyer_public_id text, p_flyer_version text, p_starts_at timestamp with time zone,
  p_ends_at timestamp with time zone, p_require_registration boolean, p_featured boolean,
  p_specific_dates jsonb, p_ticket_types jsonb, p_promo_codes jsonb, p_receiving_account jsonb,
  p_place_id uuid default null,
  p_country_code text default null,
  p_timezone text default null,
  p_currency text default null
)
  returns uuid
  language plpgsql
  set search_path to 'public', 'extensions'
as $function$
declare
  v_event_id uuid;
  v_country  text;
  v_timezone text;
  v_currency text;
begin
  select id into v_event_id from event where client_request_id = p_client_request_id;
  if v_event_id is not null then
    return v_event_id;
  end if;

  v_country := upper(coalesce(p_country_code, p_address ->> 'country_code', public.default_market_country()));
  v_timezone := coalesce(p_timezone, public.market_timezone_for_country(v_country));
  v_currency := upper(coalesce(
    p_currency,
    (select elem ->> 'currency' from jsonb_array_elements(coalesce(p_ticket_types, '[]'::jsonb)) elem
      where coalesce(elem ->> 'currency', '') <> '' limit 1),
    public.market_currency_for_country(v_country)
  ));
  if not exists (select 1 from public.currency c where c.code = v_currency) then
    raise exception 'Unknown currency %', v_currency using errcode = 'check_violation';
  end if;

  insert into event (
    client_request_id, organizer_id, title, slug, description, event_code,
    event_category, event_type, location, address, capacity, website_url,
    flyer_public_id, flyer_version, starts_at, ends_at, status,
    require_registration, featured, place_id, created_at,
    country_code, timezone, currency
  )
  values (
    p_client_request_id, p_organizer_id, p_title, p_slug, p_description, p_event_code,
    p_event_category, array_to_json(p_event_type)::text,
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::extensions.geography,
    p_address, p_capacity, p_website_url,
    p_flyer_public_id, p_flyer_version, p_starts_at, p_ends_at, 'published',
    p_require_registration, coalesce(p_featured, false), p_place_id, now(),
    v_country, v_timezone, v_currency
  )
  on conflict (client_request_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select id into v_event_id from event where client_request_id = p_client_request_id;
    return v_event_id;
  end if;

  if p_specific_dates is not null and jsonb_array_length(p_specific_dates) > 0 then
    insert into event_occurrence (event_id, starts_at, ends_at)
    select v_event_id, (elem->>'start')::timestamptz, (elem->>'end')::timestamptz
    from jsonb_array_elements(p_specific_dates) elem;
  end if;

  if p_receiving_account is not null then
    insert into receiving_account (
      full_name, email, phone, network_service_provider, user_id, event_id,
      bank_name, bank_branch, bank_account_number, payment_option
    )
    values (
      p_receiving_account->>'full_name',
      p_receiving_account->>'email',
      p_receiving_account->>'phone',
      p_receiving_account->>'network_service_provider',
      p_organizer_id,
      v_event_id,
      p_receiving_account->>'bank_name',
      p_receiving_account->>'bank_branch',
      p_receiving_account->>'bank_account_number',
      p_receiving_account->>'payment_option'
    );
  end if;

  if p_ticket_types is not null and jsonb_array_length(p_ticket_types) > 0 then
    insert into ticket_type (event_id, type, price, currency, quantity, available_from, available_until, admits)
    select
      v_event_id,
      elem->>'type',
      (elem->>'price')::numeric,
      v_currency,
      (elem->>'quantity')::integer,
      (elem->>'available_from')::timestamp,
      (elem->>'available_until')::timestamp,
      coalesce(nullif(elem->>'admits', '')::smallint, 1)
    from jsonb_array_elements(p_ticket_types) elem;
  end if;

  if p_promo_codes is not null and jsonb_array_length(p_promo_codes) > 0 then
    insert into promo_code (event_id, promo_code, discount_percentage, expires_at, max_uses, is_active)
    select
      v_event_id,
      upper(btrim(elem->>'promo_code')),
      (elem->>'discount_percentage')::integer,
      (elem->>'expires_at')::timestamp,
      (elem->>'max_uses')::integer,
      (elem->>'expires_at')::timestamp > now()
    from jsonb_array_elements(p_promo_codes) elem;
  end if;

  return v_event_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. The switch
-- ---------------------------------------------------------------------------

insert into public.feature_flag (key, description, enabled, rules) values
  ('tickets.group_pricing',
   'Group tickets (one ticket type admits several people) and automatic group prices, for the organizers it is on for (allowSubjects: their account or team id)',
   false,
   '{"allowSubjects": [], "percent": 0}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Checks
-- ---------------------------------------------------------------------------

do $$
begin
  if has_table_privilege('authenticated', 'public.event_group_discount', 'insert')
     or has_table_privilege('authenticated', 'public.event_group_discount', 'update')
     or has_table_privilege('authenticated', 'public.event_group_discount', 'delete') then
    raise exception 'migration check: group prices are written by the server only';
  end if;
  if has_function_privilege('authenticated', 'public.create_ticket_checkout(uuid, uuid, uuid, uuid, text, timestamp with time zone, jsonb)', 'execute') then
    raise exception 'migration check: create_ticket_checkout must stay service role only';
  end if;
  if exists (select 1 from public.ticket_checkout where quantity % admits <> 0) then
    raise exception 'migration check: every checkout line is a whole number of purchases';
  end if;
end;
$$;

commit;
