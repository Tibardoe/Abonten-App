-- Same-day sales: keep selling while a session is on (2026-11-23, the
-- founder's decision; docs/architecture/ticket-sales-window.md).
--
-- Until now a ticket was only sold for a session that had not started.
-- An amusement park open 11:00-19:00 could not sell today's entry once it
-- opened, while families decide on the day. An organizer now chooses when
-- online sales close for each session of an event:
--
--   * event.sales_close_before_end_minutes is null (the default, every
--     existing event): when the session starts, as before;
--   * 0, 30, 60 or 120: that many minutes before the session ends (0 =
--     until it ends), never earlier than its start.
--
-- public.event_session_sales_close_at() is the one rule in SQL; its twin is
-- @abonten/core/eventPurchaseEligibility (sessionSalesCloseAt): change the
-- two together. Every function that decides whether a session can be sold
-- now reads it: create_ticket_checkout (paid), issue_free_ticket (free
-- registration), ticket_pass_claim and ticket_pass_state (choosing a show
-- of a run with a pass). Each is made again whole from its live definition,
-- checked against its fingerprint first: create_ticket_checkout (defined in
-- 20261119200000) and issue_free_ticket (20261115100000), both as patched
-- by 20261120210000; ticket_pass_claim and ticket_pass_state (defined in
-- 20261120100000, patched by 20261120120000 and 20261120150000, the claim
-- by 20261120210000 too). Only the sales-window lines change.
--
-- Unchanged on purpose: complimentary tickets (already allowed until the
-- event ends), Pay small small (a plan needs 48 hours before the date, so
-- the services never offer one for a session that is on), refunds (no
-- buyer cancels once the show has started, buyerCancelGate), postponed
-- events (sell nothing), the ticket's expiry (the event's end), check-in
-- and settlement (48 hours after the end).

begin;

-- ---------------------------------------------------------------------------
-- Fingerprints (line endings ignored)
do $fp$
declare
  r record;
begin
  for r in
    select * from (values
      ('create_ticket_checkout', '499b331a5b7b6df88ae2471296ad321f'),
      ('issue_free_ticket',      '80de984cfbcade7f3192ed3e6e78ad0d'),
      ('ticket_pass_claim',      '3306448031169c5f8ccd7e0fdadbccc5'),
      ('ticket_pass_state',      '10b6b2b4f491c35ac738410dc0a3ab97')
    ) as f(name, fingerprint)
  loop
    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = r.name
        and md5(replace(p.prosrc, E'\r', '')) = r.fingerprint
    ) then
      raise exception 'same-day sales: public.% is not the definition this migration expects', r.name;
    end if;
  end loop;
end;
$fp$;

-- ---------------------------------------------------------------------------
-- The setting

alter table public.event
  add column if not exists sales_close_before_end_minutes integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_sales_close_before_end_minutes_check'
  ) then
    alter table public.event
      add constraint event_sales_close_before_end_minutes_check
        check (sales_close_before_end_minutes is null
               or sales_close_before_end_minutes in (0, 30, 60, 120));
  end if;
end;
$$;

comment on column public.event.sales_close_before_end_minutes is
  'When online sales close for each session: null = at its start (the default); 0, 30, 60 or 120 = that many minutes before it ends (never before its start). @abonten/core/eventPurchaseEligibility, public.event_session_sales_close_at.';

-- ---------------------------------------------------------------------------
-- The rule

create or replace function public.event_session_sales_close_at(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_close_before_end_minutes integer
)
returns timestamptz
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_starts_at is null then null
    when p_close_before_end_minutes is null or p_ends_at is null then p_starts_at
    else greatest(
      p_starts_at,
      p_ends_at - make_interval(mins => p_close_before_end_minutes)
    )
  end;
$$;

comment on function public.event_session_sales_close_at(timestamptz, timestamptz, integer) is
  'When online sales close for one session: its start, or the event''s sales_close_before_end_minutes before its end (never before its start). Twin of @abonten/core/eventPurchaseEligibility sessionSalesCloseAt.';

revoke all on function public.event_session_sales_close_at(timestamptz, timestamptz, integer) from public;
grant execute on function public.event_session_sales_close_at(timestamptz, timestamptz, integer)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Paid checkout

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

-- ---------------------------------------------------------------------------
-- Free registration

CREATE OR REPLACE FUNCTION public.issue_free_ticket(p_user_id uuid, p_event_id uuid, p_occurrence_id uuid, p_ticket_code text, p_qr_public_id text, p_qr_version text, p_expires_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller uuid := auth.uid();
  v_event_status text;
  v_event_starts_at timestamptz;
  v_event_ends_at timestamptz;
  v_close_minutes integer;
  v_occ_count integer;
  v_on_sale boolean;
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
  -- The same window as a paid ticket: public.event_session_sales_close_at.
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
    raise exception 'This event is no longer accepting RSVPs.'
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
    raise exception 'This event is not open for registration.'
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

  select id into v_ticket_type_id
  from public.ticket_type
  where event_id = p_event_id and type = 'FREE'
  limit 1;

  if v_ticket_type_id is null then
    raise exception 'This event has no free registration available'
      using errcode = 'no_data_found';
  end if;

  -- Friendly pre-check (the partial unique indexes
  -- ticket_one_active_free_registration and
  -- ticket_one_free_registration_per_issuee are the real race guarantee).
  -- A free ticket the person was issued and then sent on still counts as
  -- theirs (X38).
  if exists (
    select 1 from public.ticket
    where (user_id = p_user_id or issued_to = p_user_id)
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
$function$;

-- ---------------------------------------------------------------------------
-- Choosing a show with a pass: the chosen show's own sales window

CREATE OR REPLACE FUNCTION public.ticket_pass_claim(p_pass_ticket uuid, p_holder uuid, p_event_id uuid, p_expires_at timestamp with time zone, p_ticket jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_host      public.ticket%rowtype;
  v_host_type public.ticket_type%rowtype;
  v_series    uuid;
  v_target    public.event%rowtype;
  v_type      public.ticket_type%rowtype;
  v_used      integer;
  v_checkout  uuid;
  v_ticket    uuid;
begin
  -- One choice at a time per pass.
  select * into v_host from public.ticket where id = p_pass_ticket for update;
  if not found or v_host.user_id is distinct from p_holder
     or v_host.status not in ('active', 'used') then
    raise exception 'This pass is not yours to use.'
      using errcode = 'check_violation';
  end if;
  select * into v_host_type from public.ticket_type where id = v_host.ticket_type_id;
  if v_host_type.pass_shows is null
     -- A ticket chosen with a pass is not a pass itself.
     or exists (
       select 1 from public.ticket_checkout c
       where c.id = v_host.ticket_checkout_id and c.pass_ticket_id is not null
     ) then
    raise exception 'This ticket is not a pass.'
      using errcode = 'check_violation';
  end if;
  select e.series_id into v_series from public.event e where e.id = v_host_type.event_id;

  select * into v_target from public.event where id = p_event_id;
  if not found or v_series is null or v_target.series_id is distinct from v_series
     or v_target.id = v_host_type.event_id
     or exists (select 1 from public.event_occurrence o where o.event_id = v_target.id) then
    raise exception 'Choose another show of this run.'
      using errcode = 'check_violation';
  end if;
  -- A show can be chosen while its tickets are on sale (its start, or
  -- before its end when the organizer keeps selling while it's on).
  if v_target.status is distinct from 'published'
     or coalesce(public.event_session_sales_close_at(
          v_target.starts_at, v_target.ends_at, v_target.sales_close_before_end_minutes
        ) <= now(), true)
     or v_target.moderation_state in ('hidden', 'removed')
     or v_target.postponed_at is not null then
    raise exception 'This show can no longer be chosen.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from public.ticket_checkout c
    join public.ticket t on t.ticket_checkout_id = c.id
    where c.pass_ticket_id = v_host.id and c.event_id = p_event_id
      and t.status in ('active', 'used')
  ) then
    raise exception 'This pass already has a ticket for that show.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_used
  from public.ticket_checkout c
  join public.ticket t on t.ticket_checkout_id = c.id
  where c.pass_ticket_id = v_host.id and t.status in ('active', 'used');
  if 1 + v_used >= v_host_type.pass_shows then
    raise exception 'Every show of this pass has been chosen.'
      using errcode = 'check_violation';
  end if;

  select * into v_type
  from public.ticket_type t
  where t.event_id = p_event_id
    and lower(t.type) = lower(v_host_type.type)
    and t.pass_shows is not null
  order by t.created_at
  limit 1
  for update;
  if not found then
    raise exception 'This show does not take this pass.'
      using errcode = 'check_violation';
  end if;

  update public.ticket_type
  set quantity = quantity - 1
  where id = v_type.id and (quantity is null or quantity >= 1);
  if not found then
    raise exception 'This show has no places left for passes.'
      using errcode = 'check_violation';
  end if;

  insert into public.ticket_checkout (
    checkout_session_id, user_id, event_id, ticket_type_id, quantity, admits,
    unit_price, discount, discounted_units, total_price, status,
    completed_at, pass_ticket_id
  ) values (
    gen_random_uuid(), p_holder, p_event_id, v_type.id, 1, 1,
    0, 0, 0, 0, 'paid',
    now(), v_host.id
  )
  returning id into v_checkout;

  insert into public.ticket (
    user_id, ticket_type_id, ticket_checkout_id,
    qr_public_id, qr_version, ticket_code, expires_at,
    transaction_id, metadata, status
  ) values (
    p_holder, v_type.id, v_checkout,
    p_ticket->>'qr_public_id', p_ticket->>'qr_version', p_ticket->>'ticket_code', p_expires_at,
    null, jsonb_build_object('pass', v_host.id), 'active'
  )
  returning id into v_ticket;

  insert into public.attendance (
    user_id, event_id, ticket_type_id, ticket_id, status, number_of_tickets
  ) values (
    p_holder, p_event_id, v_type.id, v_ticket, 'attending', 1
  );

  return v_ticket;
end;
$function$;

-- 'started' tells the pass holder a show can no longer be chosen: its
-- tickets are no longer on sale (@abonten/core/showPasses passShowChoosable).
CREATE OR REPLACE FUNCTION public.ticket_pass_state(p_pass_ticket uuid, p_holder uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_host   public.ticket%rowtype;
  v_type   public.ticket_type%rowtype;
  v_event  public.event%rowtype;
  v_used   integer;
  v_shows  jsonb;
begin
  select * into v_host from public.ticket where id = p_pass_ticket;
  if not found or v_host.user_id is distinct from p_holder then
    return null;
  end if;
  select * into v_type from public.ticket_type where id = v_host.ticket_type_id;
  if v_type.pass_shows is null then
    return null;
  end if;
  -- A ticket chosen with a pass is not a pass itself.
  if exists (
    select 1 from public.ticket_checkout c
    where c.id = v_host.ticket_checkout_id and c.pass_ticket_id is not null
  ) then
    return null;
  end if;
  select * into v_event from public.event where id = v_type.event_id;

  select count(*) into v_used
  from public.ticket_checkout c
  join public.ticket t on t.ticket_checkout_id = c.id
  where c.pass_ticket_id = v_host.id and t.status in ('active', 'used');

  with claims as (
    select c.event_id, t.id as ticket_id, t.status
    from public.ticket_checkout c
    join public.ticket t on t.ticket_checkout_id = c.id
    where c.pass_ticket_id = v_host.id and t.status in ('active', 'used')
  ),
  shows as (
    select e.*
    from public.event e
    where v_event.series_id is not null
      and e.series_id = v_event.series_id
      and (
        e.id = v_event.id
        or e.id in (select event_id from claims)
        or (e.status = 'published' and e.archived_at is null
            and coalesce(e.ends_at, e.starts_at) > now()
            and e.moderation_state is distinct from 'hidden'
            and e.moderation_state is distinct from 'removed')
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'event_id', s.id,
           'event_code', s.event_code,
           'starts_at', s.starts_at,
           'ends_at', s.ends_at,
           'timezone', s.timezone,
           'status', s.status,
           'is_bought_show', s.id = v_event.id,
           'ticket_id', case when s.id = v_event.id then v_host.id else cl.ticket_id end,
           'ticket_status', case when s.id = v_event.id then v_host.status else cl.status end,
           'has_pass', pt.id is not null,
           'passes_left', pt.quantity,
           'started', coalesce(public.event_session_sales_close_at(
                        s.starts_at, s.ends_at, s.sales_close_before_end_minutes
                      ) <= now(), true)
         ) order by s.starts_at, s.id), '[]'::jsonb)
  into v_shows
  from shows s
  left join claims cl on cl.event_id = s.id
  left join lateral (
    select t.id, t.quantity
    from public.ticket_type t
    where t.event_id = s.id and lower(t.type) = lower(v_type.type) and t.pass_shows is not null
    order by t.created_at
    limit 1
  ) pt on true;

  return jsonb_build_object(
    'pass_ticket_id', v_host.id,
    'pass_status', v_host.status,
    'name', v_type.type,
    'shows_total', v_type.pass_shows,
    'shows_used', 1 + v_used,
    'bought_event_id', v_event.id,
    'shows', v_shows
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- Checks: the money-path functions stay service role only.

do $check$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.create_ticket_checkout(uuid, uuid, uuid, uuid, text, timestamptz, jsonb)',
    'public.issue_free_ticket(uuid, uuid, uuid, text, text, text, timestamptz)',
    'public.ticket_pass_claim(uuid, uuid, uuid, timestamptz, jsonb)',
    'public.ticket_pass_state(uuid, uuid)'
  ] loop
    if has_function_privilege('authenticated', v_fn, 'execute')
       or has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'migration check: % is service role only', v_fn;
    end if;
  end loop;

  -- The rule: the default closes at the start, the setting before the end
  -- (never before the start).
  if public.event_session_sales_close_at('2026-11-23 11:00+00', '2026-11-23 19:00+00', null)
       is distinct from '2026-11-23 11:00+00'::timestamptz
     or public.event_session_sales_close_at('2026-11-23 11:00+00', '2026-11-23 19:00+00', 60)
       is distinct from '2026-11-23 18:00+00'::timestamptz
     or public.event_session_sales_close_at('2026-11-23 11:00+00', '2026-11-23 11:30+00', 120)
       is distinct from '2026-11-23 11:00+00'::timestamptz
     or public.event_session_sales_close_at(null, '2026-11-23 19:00+00', 0) is not null then
    raise exception 'migration check: event_session_sales_close_at is wrong';
  end if;
end;
$check$;

commit;
