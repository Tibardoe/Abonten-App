-- Pay small small: paying for a ticket in parts before the event
-- (PROJECT.md §67, docs/architecture/ticket-plans.md).
--
-- A buyer chooses tickets for an event whose organizer allows it, the price
-- is locked and the seats are held for them, and they pay any amount above a
-- minimum, as often as they like, until a deadline before the event. When
-- the last part arrives the tickets are issued exactly as a normal purchase
-- would issue them. A plan that is not finished by its deadline, that the
-- buyer cancels, or whose event is cancelled ends: the seats go back on sale
-- and what was paid is refunded through each part's own charge, minus the
-- service-fee share when the plan's terms say so (the same rule every refund
-- on Abonten follows). It is not credit: nobody holds a ticket they have not
-- paid for in full, and nothing is charged on top.
--
--   ticket_plan_program_setting  switches (off), audience, the plan rules
--   event_ticket_plan_setting    the organizer's opt-in, per event
--   ticket_plan                  one plan: the locked price, what is paid,
--                                its deadline and how it ended
--   ticket_plan_payment          every part received, and its refund
--
-- How it rides on the existing money path:
--   * The held seats are the plan's own ticket_checkout rows with the new
--     status 'on_plan'. They count against capacity like 'pending' rows,
--     but every checkout path that reads 'pending' (the basket, the sweep,
--     the pay flow) ignores them, so a plan's seats can be neither paid
--     through a normal checkout nor expired by the 30-minute sweep.
--   * Each part is a payment_attempt whose target is the plan
--     (payment_attempt.ticket_plan_id); finalizePayment verifies it with the
--     provider like any charge and records it here.
--   * The last part opens the plan's settlement: an attempt on the plan's
--     checkout session with the internal provider 'abonten_plan' (like
--     'abonten_credit', it never reaches a provider). finalizePayment turns
--     it into one `transaction` for the whole price and issues the tickets
--     through issue_tickets_for_checkout, so the organizer's earning, the
--     platform fee record, refunds and payouts see an ordinary sale.
--   * Refunds go back through the parts' own provider charges, allocated in
--     proportion to each part (ticket_plan_payment.refund_*); the
--     ticket-plans job asks the provider, the refund webhook confirms.
--
-- Everything here is service-role only. The programme ships switched off.

-- ---------------------------------------------------------------------------
-- 1. Programme settings
-- ---------------------------------------------------------------------------

create table public.ticket_plan_program_setting (
  id                           smallint primary key default 1 check (id = 1),
  enabled                      boolean not null default false,
  audience                     text not null default 'staff'
                                 check (audience in ('staff', 'beta', 'all')),
  beta_user_ids                uuid[] not null default '{}',
  -- The first part holds the seats: at least this share of the total.
  first_part_min_bps           integer not null default 2000
                                 check (first_part_min_bps between 500 and 10000),
  -- Every later part (the last one may be whatever is left).
  part_min_bps                 integer not null default 1000
                                 check (part_min_bps between 100 and 10000),
  -- Paying must be finished this long before the chosen date starts.
  deadline_hours_before_start  integer not null default 48
                                 check (deadline_hours_before_start between 1 and 720),
  -- A plan is offered only while its deadline is at least this far away.
  min_days_to_deadline         integer not null default 3
                                 check (min_days_to_deadline between 1 and 60),
  -- How long the seats are held for the first part to be paid.
  hold_minutes                 integer not null default 30
                                 check (hold_minutes between 10 and 240),
  max_tickets_per_plan         integer not null default 4
                                 check (max_tickets_per_plan between 1 and 20),
  -- When a plan ends unfinished, the service-fee share of what was paid is
  -- kept (true, the rule for every refund) or returned too (false). Copied
  -- onto each plan when it starts: changing it never changes a running plan.
  keep_fee_on_refund           boolean not null default true,
  -- Reminders, in days before the deadline, while something is left to pay.
  reminder_days                integer[] not null default '{7,2}',
  updated_at                   timestamptz not null default now(),
  updated_by                   uuid references public.user_info (id) on delete set null,
  constraint ticket_plan_program_minimums check (part_min_bps <= first_part_min_bps)
);

insert into public.ticket_plan_program_setting (id) values (1)
on conflict (id) do nothing;

-- The organizer's choice. A plan holds the organizer's seats for weeks and
-- pays them only when it is finished, so it is never on by default.
create table public.event_ticket_plan_setting (
  event_id    uuid primary key references public.event (id) on delete cascade,
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.user_info (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- 2. Plans and their parts
-- ---------------------------------------------------------------------------

create table public.ticket_plan (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.user_info (id) on delete restrict,
  event_id               uuid not null references public.event (id) on delete restrict,
  occurrence_id          uuid references public.event_occurrence (id) on delete set null,
  -- The plan's held seats: ticket_checkout rows with this session id.
  checkout_session_id    uuid not null unique,
  status                 text not null default 'awaiting_payment'
                           check (status in ('awaiting_payment', 'active', 'settling',
                                             'completed', 'expired', 'lapsed', 'cancelled')),
  currency               char(3) not null references public.currency (code),
  country_code           char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  -- The locked price, in minor units of the event's currency.
  ticket_minor           bigint not null check (ticket_minor > 0),
  fee_minor              bigint not null check (fee_minor >= 0),
  tax_minor              bigint not null default 0 check (tax_minor >= 0),
  total_minor            bigint not null,
  paid_minor             bigint not null default 0,
  fee_bps                integer not null check (fee_bps between 0 and 10000),
  first_part_min_minor   bigint not null,
  part_min_minor         bigint not null,
  keep_fee_on_refund     boolean not null,
  hold_expires_at        timestamptz not null,
  deadline_at            timestamptz not null,
  event_starts_at        timestamptz not null,
  settlement_attempt_id  uuid references public.payment_attempt (id) on delete restrict,
  transaction_id         uuid references public.transaction (id) on delete restrict,
  refund_status          text not null default 'none'
                           check (refund_status in ('none', 'pending', 'refunded', 'failed')),
  refund_minor           bigint not null default 0,
  kept_minor             bigint not null default 0,
  ended_reason           text check (ended_reason in ('hold_expired', 'deadline', 'buyer',
                                                      'event_cancelled', 'account_closed', 'admin')),
  reminders_sent         integer[] not null default '{}',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  completed_at           timestamptz,
  ended_at               timestamptz,
  constraint ticket_plan_total check (total_minor = ticket_minor + fee_minor + tax_minor),
  constraint ticket_plan_paid check (paid_minor between 0 and total_minor),
  constraint ticket_plan_minimums check (
    first_part_min_minor > 0 and first_part_min_minor <= total_minor
    and part_min_minor > 0 and part_min_minor <= first_part_min_minor),
  constraint ticket_plan_refund_split check (
    refund_minor >= 0 and kept_minor >= 0 and refund_minor + kept_minor <= paid_minor),
  constraint ticket_plan_deadline check (deadline_at < event_starts_at),
  constraint ticket_plan_completed check (status <> 'completed' or transaction_id is not null),
  constraint ticket_plan_ended check (
    (status in ('expired', 'lapsed', 'cancelled')) = (ended_reason is not null and ended_at is not null)
    or status = 'completed')
);

comment on table public.ticket_plan is
  'Pay small small: one buyer paying for one event''s tickets in parts. The price is locked and the seats held (ticket_checkout status on_plan) until the deadline. Written only by the ticket_plan_* functions and @abonten/services/ticketPlans.';

-- One open plan per person and event.
create unique index ticket_plan_one_open_per_event
  on public.ticket_plan (user_id, event_id)
  where status in ('awaiting_payment', 'active', 'settling');
create index ticket_plan_user_idx on public.ticket_plan (user_id, created_at desc);
create index ticket_plan_event_open_idx on public.ticket_plan (event_id)
  where status in ('awaiting_payment', 'active', 'settling');
create index ticket_plan_hold_idx on public.ticket_plan (hold_expires_at)
  where status = 'awaiting_payment';
create index ticket_plan_deadline_idx on public.ticket_plan (deadline_at)
  where status = 'active';
create index ticket_plan_refund_idx on public.ticket_plan (refund_status)
  where refund_status in ('pending', 'failed');
create index ticket_plan_transaction_idx on public.ticket_plan (transaction_id)
  where transaction_id is not null;

create table public.ticket_plan_payment (
  id                       uuid primary key default gen_random_uuid(),
  plan_id                  uuid not null references public.ticket_plan (id) on delete restrict,
  user_id                  uuid not null references public.user_info (id) on delete restrict,
  payment_attempt_id       uuid not null unique references public.payment_attempt (id) on delete restrict,
  amount_minor             bigint not null check (amount_minor > 0),
  currency                 char(3) not null references public.currency (code),
  provider                 text not null,
  provider_reference       text not null,
  provider_transaction_id  text,
  -- The provider's own fee for this charge, when it reported one.
  provider_fee_minor       bigint check (provider_fee_minor is null or provider_fee_minor >= 0),
  method                   text,
  paid_at                  timestamptz not null default now(),
  -- The share of this part that goes back when the plan is refunded.
  refund_minor             bigint not null default 0,
  -- planned: decided, not yet asked of the provider; requesting: being
  -- asked right now (claimed); requested: the provider accepted it;
  -- processed / failed: the provider's webhook said so.
  refund_status            text not null default 'none'
                             check (refund_status in ('none', 'planned', 'requesting',
                                                      'requested', 'processed', 'failed')),
  refund_claimed_at        timestamptz,
  refund_requested_at      timestamptz,
  refund_processed_at      timestamptz,
  refund_attempts          integer not null default 0,
  refund_failure           text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint ticket_plan_payment_refund check (refund_minor between 0 and amount_minor),
  constraint ticket_plan_payment_reference unique (provider, provider_reference)
);

create index ticket_plan_payment_plan_idx on public.ticket_plan_payment (plan_id, paid_at);
create index ticket_plan_payment_refund_idx on public.ticket_plan_payment (refund_status)
  where refund_status in ('planned', 'requesting', 'requested', 'failed');
create index ticket_plan_payment_provider_txn_idx
  on public.ticket_plan_payment (provider, provider_transaction_id)
  where provider_transaction_id is not null;

create or replace function public._ticket_plan_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_ticket_plan_updated_at
  before update on public.ticket_plan
  for each row execute function public._ticket_plan_touch_updated_at();
create trigger trg_ticket_plan_payment_updated_at
  before update on public.ticket_plan_payment
  for each row execute function public._ticket_plan_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Access: service role only
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'ticket_plan_program_setting', 'event_ticket_plan_setting',
    'ticket_plan', 'ticket_plan_payment'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The existing money path learns about plans
-- ---------------------------------------------------------------------------

-- A part is a payment attempt whose target is the plan.
alter table public.payment_attempt
  add column if not exists ticket_plan_id uuid
    references public.ticket_plan (id) on delete restrict;

create index if not exists idx_payment_attempt_ticket_plan
  on public.payment_attempt (ticket_plan_id)
  where ticket_plan_id is not null;

alter table public.payment_attempt drop constraint if exists payment_attempt_target_check;
alter table public.payment_attempt add constraint payment_attempt_target_check check (
  ((checkout_session_id is not null)::integer
   + (subscription_checkout_id is not null)::integer
   + (place_promotion_checkout_id is not null)::integer
   + (event_promotion_checkout_id is not null)::integer
   + (content_campaign_checkout_id is not null)::integer
   + (ticket_plan_id is not null)::integer) = 1
);

-- One part at a time: two open charges on one plan could together pay more
-- than is left.
create unique index if not exists payment_attempt_one_open_per_ticket_plan
  on public.payment_attempt (ticket_plan_id)
  where ticket_plan_id is not null
    and status in ('initiated', 'pending', 'processing');

-- The settlement transaction of a finished plan names the internal provider.
alter table public.transaction drop constraint if exists transaction_provider_check;
alter table public.transaction
  add constraint transaction_provider_check
  check (provider in ('paystack', 'stripe', 'abonten_credit', 'abonten_plan'));

-- The plan's held seats.
alter table public.ticket_checkout drop constraint if exists ticket_checkout_status_check;
alter table public.ticket_checkout
  add constraint ticket_checkout_status_check
  check (status = any (array['pending'::text, 'on_plan'::text, 'paid'::text,
                             'failed'::text, 'cancelled'::text, 'expired'::text]));

-- Capacity: a seat held by a plan is a seat taken, exactly like a seat in a
-- pending checkout (migration event_capacity_and_free_event_promo_guards).
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
                where c.event_id = p_event_id and c.status in ('pending', 'on_plan')), 0)
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
                  where c.event_id = e.id and c.status in ('pending', 'on_plan')), 0)
      - coalesce((select sum(t.quantity)
                  from public.ticket_type t
                  where t.event_id = e.id and t.quantity is not null), 0)
  end
  from public.event e
  where e.id = p_event_id;
$$;

drop trigger if exists trg_event_capacity_on_checkout on public.ticket_checkout;
create constraint trigger trg_event_capacity_on_checkout
  after insert or update of quantity, status on public.ticket_checkout
  deferrable initially deferred
  for each row
  when (new.status in ('pending', 'on_plan'))
  execute function public.enforce_event_capacity();

-- Issuance: a plan's held rows are issued like pending rows, but only on the
-- authority of the plan's own settlement attempt (provider 'abonten_plan'),
-- so no ordinary charge can ever pay for seats a plan holds. Otherwise the
-- body is unchanged from migration issue_tickets_for_checkout_rpc.
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
  v_on_plan    boolean;
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
    bool_or(status in ('pending', 'on_plan')),
    bool_or(status = 'on_plan'),
    coalesce(sum(quantity) filter (where status in ('pending', 'on_plan')), 0),
    (array_agg(event_id))[1]
  into v_locked_count, v_all_paid, v_any_pending, v_on_plan, v_total_qty, v_event_id
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
      and status not in ('pending', 'on_plan')
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
        and (not v_on_plan or pa.provider = 'abonten_plan')
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
    if v_on_plan or exists (
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
      and status in ('pending', 'on_plan')
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
    and status in ('pending', 'on_plan');

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

revoke all on function public.issue_tickets_for_checkout(uuid, uuid, uuid, jsonb, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.issue_tickets_for_checkout(uuid, uuid, uuid, jsonb, timestamptz, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. The plan's state machine
-- ---------------------------------------------------------------------------

-- Starts a plan: the seats are reserved through create_ticket_checkout (the
-- same sales-window, price and capacity checks as any checkout) and then
-- moved to 'on_plan', held until the deadline. The service has priced the
-- order (ticket, fee, tax) and checked the programme, the event's opt-in
-- and the buyer; this re-checks what it can.
create or replace function public.ticket_plan_create(
  p_user_id               uuid,
  p_event_id              uuid,
  p_occurrence_id         uuid,
  p_lines                 jsonb,
  p_currency              text,
  p_country_code          text,
  p_ticket_minor          bigint,
  p_fee_minor             bigint,
  p_tax_minor             bigint,
  p_fee_bps               integer,
  p_first_part_min_minor  bigint,
  p_part_min_minor        bigint,
  p_keep_fee_on_refund    boolean,
  p_hold_expires_at       timestamptz,
  p_deadline_at           timestamptz,
  p_event_starts_at       timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session     uuid;
  v_plan        uuid;
  v_lines_total numeric;
begin
  if p_deadline_at <= now() or p_hold_expires_at <= now() then
    raise exception 'ticket_plan_create: deadline passed' using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.event_ticket_plan_setting s
    where s.event_id = p_event_id and s.enabled
  ) then
    raise exception 'ticket_plan_create: not offered' using errcode = 'check_violation';
  end if;

  -- Only paid tickets of this event, in its currency.
  if exists (
    select 1
    from jsonb_array_elements(p_lines) l
    left join public.ticket_type t on t.id = (l->>'ticket_type_id')::uuid
    where t.id is null
       or t.event_id is distinct from p_event_id
       or upper(t.currency) <> upper(p_currency)
       or coalesce(t.price, 0) <= 0
       or coalesce(t.type, '') = 'FREE'
  ) then
    raise exception 'ticket_plan_create: unpaid ticket' using errcode = 'check_violation';
  end if;

  select coalesce(sum((l->>'amount')::numeric), 0) into v_lines_total
  from jsonb_array_elements(p_lines) l;
  if public.major_to_minor(v_lines_total, p_currency) <> p_ticket_minor then
    raise exception 'ticket_plan_create: price mismatch' using errcode = 'check_violation';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ticket_plan:' || p_user_id::text || ':' || p_event_id::text, 0)
  );

  if exists (
    select 1 from public.ticket_plan
    where user_id = p_user_id and event_id = p_event_id
      and status in ('awaiting_payment', 'active', 'settling')
  ) then
    raise exception 'ticket_plan_create: already open' using errcode = 'unique_violation';
  end if;

  v_session := public.create_ticket_checkout(
    p_user_id, p_event_id, p_occurrence_id, null, null, p_hold_expires_at, p_lines);

  insert into public.ticket_plan (
    user_id, event_id, occurrence_id, checkout_session_id, status,
    currency, country_code, ticket_minor, fee_minor, tax_minor, total_minor,
    fee_bps, first_part_min_minor, part_min_minor, keep_fee_on_refund,
    hold_expires_at, deadline_at, event_starts_at
  ) values (
    p_user_id, p_event_id, p_occurrence_id, v_session, 'awaiting_payment',
    upper(p_currency), upper(p_country_code), p_ticket_minor, p_fee_minor,
    p_tax_minor, p_ticket_minor + p_fee_minor + p_tax_minor,
    p_fee_bps, p_first_part_min_minor, p_part_min_minor, p_keep_fee_on_refund,
    p_hold_expires_at, p_deadline_at, p_event_starts_at
  )
  returning id into v_plan;

  update public.ticket_checkout
  set status = 'on_plan', expires_at = p_deadline_at, updated_at = now()
  where checkout_session_id = v_session
    and status = 'pending';

  return v_plan;
end;
$$;

-- Records a part the provider confirmed. Called by finalizePayment while it
-- holds the attempt ('processing'). The last part moves the plan to
-- 'settling' and opens its settlement attempt, which finalizePayment then
-- turns into the purchase. A part that arrives for a plan that has ended
-- (or that would pay more than is left) is not recorded: the caller
-- refunds it.
create or replace function public.ticket_plan_record_payment(
  p_attempt_id               uuid,
  p_amount_minor             bigint,
  p_provider_fee_minor       bigint,
  p_provider_transaction_id  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a            public.payment_attempt;
  p            public.ticket_plan;
  v_payment    uuid;
  v_settlement uuid;
  v_reference  text;
begin
  select * into a from public.payment_attempt where id = p_attempt_id for update;
  if not found or a.ticket_plan_id is null then
    raise exception 'ticket_plan_record_payment: not a plan payment' using errcode = 'no_data_found';
  end if;

  select * into p from public.ticket_plan where id = a.ticket_plan_id for update;

  select id into v_payment from public.ticket_plan_payment where payment_attempt_id = a.id;
  if v_payment is not null then
    return jsonb_build_object(
      'outcome', 'already', 'payment_id', v_payment, 'plan_id', p.id,
      'plan_status', p.status, 'paid_minor', p.paid_minor,
      'total_minor', p.total_minor, 'settlement_attempt_id', p.settlement_attempt_id);
  end if;

  if a.status <> 'processing' then
    raise exception 'ticket_plan_record_payment: attempt is %', a.status
      using errcode = 'check_violation';
  end if;

  if p.status not in ('awaiting_payment', 'active') then
    return jsonb_build_object('outcome', 'closed', 'plan_id', p.id, 'plan_status', p.status);
  end if;

  if upper(a.currency) <> p.currency
     or p_amount_minor <> public.major_to_minor(a.amount, a.currency)
     or p_amount_minor <= 0
     or p.paid_minor + p_amount_minor > p.total_minor then
    return jsonb_build_object('outcome', 'mismatch', 'plan_id', p.id, 'plan_status', p.status);
  end if;

  insert into public.ticket_plan_payment (
    plan_id, user_id, payment_attempt_id, amount_minor, currency, provider,
    provider_reference, provider_transaction_id, provider_fee_minor, method
  ) values (
    p.id, p.user_id, a.id, p_amount_minor, p.currency, a.provider,
    a.provider_reference, p_provider_transaction_id, p_provider_fee_minor,
    a.metadata ->> 'method'
  )
  returning id into v_payment;

  update public.payment_attempt
  set status = 'succeeded', paid_at = now(), verified_at = now(), updated_at = now()
  where id = a.id;

  update public.ticket_plan
  set paid_minor = paid_minor + p_amount_minor,
      status = case when paid_minor + p_amount_minor = total_minor then 'settling' else 'active' end
  where id = p.id
  returning * into p;

  if p.status = 'settling' then
    v_reference := 'ABNPL-' || p.id::text;
    select id into v_settlement from public.payment_attempt
    where provider = 'abonten_plan' and provider_reference = v_reference;
    if v_settlement is null then
      insert into public.payment_attempt (
        user_id, checkout_session_id, amount, currency, country_code,
        provider, provider_reference, status, metadata
      ) values (
        p.user_id, p.checkout_session_id, public.minor_to_major(p.total_minor, p.currency),
        p.currency, p.country_code, 'abonten_plan', v_reference, 'pending',
        jsonb_build_object('ticket_plan_id', p.id, 'method', 'plan', 'tax_minor', p.tax_minor)
      )
      returning id into v_settlement;
    end if;
    update public.ticket_plan set settlement_attempt_id = v_settlement where id = p.id;
  end if;

  return jsonb_build_object(
    'outcome', 'recorded', 'payment_id', v_payment, 'plan_id', p.id,
    'plan_status', p.status, 'paid_minor', p.paid_minor,
    'total_minor', p.total_minor, 'settlement_attempt_id', v_settlement);
end;
$$;

-- The settlement issued the tickets: the plan is finished.
create or replace function public.ticket_plan_mark_completed(p_plan_id uuid, p_transaction_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.ticket_plan p
  set status = 'completed', transaction_id = p_transaction_id, completed_at = now()
  where p.id = p_plan_id
    and p.status = 'settling'
    and exists (
      select 1 from public.ticket_checkout c
      where c.checkout_session_id = p.checkout_session_id and c.status = 'paid')
    and not exists (
      select 1 from public.ticket_checkout c
      where c.checkout_session_id = p.checkout_session_id and c.status <> 'paid')
  returning p.id into v_id;
  return v_id is not null;
end;
$$;

-- Splits `p_total` across the plan's parts that have no refund yet, in
-- proportion to each part (largest remainder, so the pesewas add up), and
-- marks each share 'planned'. The ticket-plans job then asks the provider.
create or replace function public._ticket_plan_allocate_refund(p_plan_id uuid, p_total bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paid bigint;
begin
  if p_total is null or p_total <= 0 then
    return;
  end if;
  select coalesce(sum(amount_minor), 0) into v_paid
  from public.ticket_plan_payment
  where plan_id = p_plan_id and refund_status = 'none';
  if p_total > v_paid then
    raise exception 'ticket_plan_allocate_refund: % is more than the % paid', p_total, v_paid
      using errcode = 'check_violation';
  end if;

  with parts as (
    select id, amount_minor
    from public.ticket_plan_payment
    where plan_id = p_plan_id and refund_status = 'none'
  ),
  shares as (
    select id,
           floor(p_total::numeric * amount_minor / v_paid)::bigint as base,
           (p_total::numeric * amount_minor / v_paid)
             - floor(p_total::numeric * amount_minor / v_paid) as frac
    from parts
  ),
  ranked as (
    select id, base, row_number() over (order by frac desc, id) as rn
    from shares
  ),
  leftover as (
    select p_total - coalesce(sum(base), 0) as n from shares
  )
  update public.ticket_plan_payment t
  set refund_minor = r.base + case when r.rn <= l.n then 1 else 0 end,
      refund_status = case when r.base + case when r.rn <= l.n then 1 else 0 end > 0
                           then 'planned' else 'none' end
  from ranked r, leftover l
  where t.id = r.id;
end;
$$;

-- Ends an open plan: 'expired' (the first part never came), 'lapsed' (the
-- deadline passed) or 'cancelled' (the buyer, the event, a closed account or
-- staff). The seats go back on sale, open part charges are closed (a late
-- payment on one is found and refunded by finalizePayment), and what was
-- paid is planned for refund per the plan's own terms. A plan whose part or
-- settlement is being confirmed this very moment answers 'busy' and is left
-- for the next run.
create or replace function public.ticket_plan_release(
  p_plan_id uuid,
  p_status  text,
  p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p          public.ticket_plan;
  s          public.payment_attempt;
  v_refund   bigint;
  v_kept     bigint;
  v_txn      uuid;
begin
  if p_status not in ('expired', 'lapsed', 'cancelled') then
    raise exception 'ticket_plan_release: unknown status %', p_status using errcode = '22023';
  end if;

  select * into p from public.ticket_plan where id = p_plan_id for update;
  if not found then
    raise exception 'ticket_plan_release: no plan %', p_plan_id using errcode = 'no_data_found';
  end if;

  if p.status not in ('awaiting_payment', 'active', 'settling') then
    return jsonb_build_object('outcome', 'not_open', 'plan_id', p.id, 'status', p.status);
  end if;

  if exists (
    select 1 from public.payment_attempt
    where ticket_plan_id = p.id and status = 'processing'
  ) then
    return jsonb_build_object('outcome', 'busy', 'plan_id', p.id, 'status', p.status);
  end if;

  v_txn := p.transaction_id;
  if p.status = 'settling' then
    select * into s from public.payment_attempt where id = p.settlement_attempt_id for update;
    if found then
      if s.status in ('processing', 'succeeded') then
        return jsonb_build_object('outcome', 'busy', 'plan_id', p.id, 'status', p.status);
      end if;
      update public.payment_attempt
      set status = 'cancelled',
          failure_reason = 'The plan ended before its tickets were issued',
          updated_at = now()
      where id = s.id;
      -- A settlement recorded but never issued (fulfilment failed) left a
      -- successful transaction with no tickets: it is being refunded now.
      if s.transaction_id is not null then
        v_txn := s.transaction_id;
        update public.transaction
        set status = 'refund_pending', refund_requested_at = now(), updated_at = now()
        where id = s.transaction_id and status = 'successful';
      end if;
    end if;
  end if;

  update public.payment_attempt
  set status = 'cancelled', failure_reason = 'The plan ended', updated_at = now()
  where ticket_plan_id = p.id and status in ('initiated', 'pending');

  with released as (
    update public.ticket_checkout
    set status = case when p_status = 'expired' then 'expired' else 'cancelled' end,
        updated_at = now()
    where checkout_session_id = p.checkout_session_id
      and status = 'on_plan'
    returning ticket_type_id, quantity
  )
  update public.ticket_type tt
  set quantity = tt.quantity + s2.total
  from (select ticket_type_id, sum(quantity) as total from released group by ticket_type_id) s2
  where tt.id = s2.ticket_type_id
    and tt.quantity is not null;

  v_refund := case
    when p.paid_minor = 0 then 0
    when p.keep_fee_on_refund then floor(p.paid_minor::numeric * p.ticket_minor / p.total_minor)::bigint
    else p.paid_minor
  end;
  v_kept := p.paid_minor - v_refund;

  perform public._ticket_plan_allocate_refund(p.id, v_refund);

  update public.ticket_plan
  set status = p_status,
      ended_reason = p_reason,
      ended_at = now(),
      refund_minor = v_refund,
      kept_minor = v_kept,
      refund_status = case when v_refund > 0 then 'pending' else 'none' end,
      transaction_id = v_txn
  where id = p.id;

  return jsonb_build_object(
    'outcome', 'ended', 'plan_id', p.id, 'status', p_status, 'reason', p_reason,
    'user_id', p.user_id, 'event_id', p.event_id, 'currency', p.currency,
    'paid_minor', p.paid_minor, 'refund_minor', v_refund, 'kept_minor', v_kept);
end;
$$;

-- A finished plan's purchase is being refunded (the event was cancelled,
-- the buyer cancelled their tickets, staff refunded it): issueRefundCore
-- worked out the cash to return (the ticket revenue, the fee kept) and this
-- plans it across the parts' own charges.
create or replace function public.ticket_plan_plan_purchase_refund(
  p_transaction_id uuid,
  p_refund_minor   bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.ticket_plan;
begin
  select * into p from public.ticket_plan where transaction_id = p_transaction_id for update;
  if not found then
    raise exception 'ticket_plan_plan_purchase_refund: no plan for transaction %', p_transaction_id
      using errcode = 'no_data_found';
  end if;

  if p.refund_status <> 'none'
     or exists (select 1 from public.ticket_plan_payment
                where plan_id = p.id and refund_status <> 'none') then
    return jsonb_build_object('outcome', 'already', 'plan_id', p.id,
                              'refund_minor', p.refund_minor);
  end if;

  if p_refund_minor < 0 or p_refund_minor > p.paid_minor then
    raise exception 'ticket_plan_plan_purchase_refund: % is not between 0 and %',
      p_refund_minor, p.paid_minor using errcode = 'check_violation';
  end if;

  perform public._ticket_plan_allocate_refund(p.id, p_refund_minor);

  update public.ticket_plan
  set refund_minor = p_refund_minor,
      kept_minor = p.paid_minor - p_refund_minor,
      refund_status = case when p_refund_minor > 0 then 'pending' else 'none' end
  where id = p.id;

  return jsonb_build_object('outcome', 'planned', 'plan_id', p.id, 'refund_minor', p_refund_minor);
end;
$$;

-- Once no share is left to ask for or wait on, the plan's refund is done
-- (and, for a finished plan, its purchase transaction is refunded). A share
-- the provider refused leaves the plan 'failed' for staff.
create or replace function public._ticket_plan_refund_rollup(p_plan_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.ticket_plan;
  v_status text;
begin
  select * into p from public.ticket_plan where id = p_plan_id for update;
  if not found or p.refund_status = 'none' then
    return coalesce(p.refund_status, 'none');
  end if;

  if exists (select 1 from public.ticket_plan_payment
             where plan_id = p.id and refund_status = 'failed') then
    v_status := 'failed';
  elsif exists (select 1 from public.ticket_plan_payment
                where plan_id = p.id and refund_status in ('planned', 'requesting', 'requested')) then
    v_status := 'pending';
  else
    v_status := 'refunded';
  end if;

  update public.ticket_plan set refund_status = v_status where id = p.id;

  if v_status = 'refunded' and p.transaction_id is not null then
    update public.transaction
    set status = 'refunded', updated_at = now()
    where id = p.transaction_id and status = 'refund_pending';
    update public.payment_attempt
    set status = 'refunded', updated_at = now()
    where transaction_id = p.transaction_id and status in ('succeeded', 'cancelled');
  end if;
  return v_status;
end;
$$;

-- The provider's refund webhook for a part's charge. Matched on the part's
-- own reference (or the provider's id for the charge).
create or replace function public.ticket_plan_part_refund_outcome(
  p_provider                text,
  p_reference               text,
  p_provider_transaction_id text,
  p_outcome                 text,
  p_detail                  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.ticket_plan_payment;
  p public.ticket_plan;
  v_plan_status text;
begin
  if p_outcome not in ('processed', 'failed') then
    raise exception 'ticket_plan_part_refund_outcome: unknown outcome %', p_outcome using errcode = '22023';
  end if;

  select * into r
  from public.ticket_plan_payment
  where provider = p_provider
    and ((p_reference is not null and provider_reference = p_reference)
         or (p_provider_transaction_id is not null
             and provider_transaction_id = p_provider_transaction_id))
  order by created_at
  limit 1
  for update;
  if not found then
    return jsonb_build_object('matched', false);
  end if;

  if r.refund_status not in ('requesting', 'requested') then
    return jsonb_build_object('matched', true, 'changed', false, 'plan_id', r.plan_id);
  end if;

  update public.ticket_plan_payment
  set refund_status = p_outcome,
      refund_processed_at = case when p_outcome = 'processed' then now() else refund_processed_at end,
      refund_failure = case when p_outcome = 'failed' then left(coalesce(p_detail, 'Refused by the provider'), 500) else refund_failure end
  where id = r.id;

  if p_outcome = 'processed' then
    update public.payment_attempt
    set status = 'refunded', updated_at = now()
    where id = r.payment_attempt_id and status = 'succeeded';
  end if;

  v_plan_status := public._ticket_plan_refund_rollup(r.plan_id);
  select * into p from public.ticket_plan where id = r.plan_id;

  return jsonb_build_object(
    'matched', true, 'changed', true, 'plan_id', p.id, 'user_id', p.user_id,
    'event_id', p.event_id, 'currency', p.currency, 'refund_status', v_plan_status,
    'refund_minor', p.refund_minor, 'part_outcome', p_outcome);
end;
$$;

-- Staff, after checking the provider's dashboard: ask again for a refused
-- or stuck share ('retry'), or record that it was refunded by hand
-- ('mark_done').
create or replace function public.ticket_plan_admin_part_refund(
  p_payment_id uuid,
  p_action     text,
  p_note       text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.ticket_plan_payment;
begin
  select * into r from public.ticket_plan_payment where id = p_payment_id for update;
  if not found then
    raise exception 'ticket_plan_admin_part_refund: no payment %', p_payment_id using errcode = 'no_data_found';
  end if;

  if p_action = 'retry' then
    if r.refund_status not in ('failed', 'requesting') then
      return jsonb_build_object('changed', false, 'refund_status', r.refund_status);
    end if;
    update public.ticket_plan_payment
    set refund_status = 'planned', refund_claimed_at = null,
        refund_failure = left(coalesce(p_note, refund_failure), 500)
    where id = r.id;
  elsif p_action = 'mark_done' then
    if r.refund_status not in ('failed', 'requesting', 'requested', 'planned') then
      return jsonb_build_object('changed', false, 'refund_status', r.refund_status);
    end if;
    update public.ticket_plan_payment
    set refund_status = 'processed', refund_processed_at = now(),
        refund_failure = left(coalesce(p_note, 'Refunded by hand'), 500)
    where id = r.id;
    update public.payment_attempt
    set status = 'refunded', updated_at = now()
    where id = r.payment_attempt_id and status = 'succeeded';
  else
    raise exception 'ticket_plan_admin_part_refund: unknown action %', p_action using errcode = '22023';
  end if;

  return jsonb_build_object('changed', true, 'plan_id', r.plan_id,
                            'refund_status', public._ticket_plan_refund_rollup(r.plan_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. The ticket-plans job
-- ---------------------------------------------------------------------------

-- Is there anything for the job to do? Holds that ran out, deadlines that
-- passed, plans on cancelled events or closed accounts, refunds to ask for
-- or stuck, settlements left unfinished, reminders due.
create or replace function public.ticket_plan_work_due()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (select 1 from public.ticket_plan p
            where p.status = 'awaiting_payment' and p.hold_expires_at < now() - interval '1 minute')
    or exists (select 1 from public.ticket_plan p
               where p.status = 'active' and p.deadline_at < now())
    or exists (select 1 from public.ticket_plan p
               join public.event e on e.id = p.event_id
               where p.status in ('awaiting_payment', 'active', 'settling')
                 and e.status = 'canceled')
    or exists (select 1 from public.ticket_plan p
               join public.user_info u on u.id = p.user_id
               where p.status in ('awaiting_payment', 'active', 'settling')
                 and u.status_id = 4)
    or exists (select 1 from public.ticket_plan_payment r
               where r.refund_status = 'planned'
                  or (r.refund_status = 'requesting' and r.refund_claimed_at < now() - interval '15 minutes'))
    or exists (select 1 from public.ticket_plan p
               where p.status = 'settling' and p.updated_at < now() - interval '5 minutes')
    or exists (select 1
               from public.ticket_plan p
               cross join public.ticket_plan_program_setting s
               cross join lateral unnest(s.reminder_days) d
               where s.id = 1
                 and p.status = 'active'
                 and p.paid_minor < p.total_minor
                 and p.deadline_at > now()
                 and p.deadline_at - make_interval(days => d) <= now()
                 and not (d = any (p.reminders_sent)));
$$;

-- Posts to /api/maintenance/ticket-plans while there is work, with the same
-- address and token as the payment-reconcile job (payment_reconcile_config):
-- both are the server's own maintenance endpoints.
create or replace function public.run_ticket_plan_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg public.payment_reconcile_config;
  v_url text;
begin
  select * into v_cfg from public.payment_reconcile_config where id = true;
  if v_cfg.dispatch_url is null or v_cfg.token is null then
    return;
  end if;
  if not public.ticket_plan_work_due() then
    return;
  end if;
  v_url := regexp_replace(v_cfg.dispatch_url, '/api/maintenance/payment-reconcile$',
                          '/api/maintenance/ticket-plans');
  if v_url = v_cfg.dispatch_url then
    return;
  end if;
  perform net.http_post(
    url                  := v_url,
    body                 := '{}'::jsonb,
    headers              := jsonb_build_object('Content-Type', 'application/json',
                                               'x-reconcile-token', v_cfg.token),
    timeout_milliseconds := 55000
  );
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public._ticket_plan_touch_updated_at()',
    'public.ticket_plan_create(uuid, uuid, uuid, jsonb, text, text, bigint, bigint, bigint, integer, bigint, bigint, boolean, timestamptz, timestamptz, timestamptz)',
    'public.ticket_plan_record_payment(uuid, bigint, bigint, text)',
    'public.ticket_plan_mark_completed(uuid, uuid)',
    'public._ticket_plan_allocate_refund(uuid, bigint)',
    'public.ticket_plan_release(uuid, text, text)',
    'public.ticket_plan_plan_purchase_refund(uuid, bigint)',
    'public._ticket_plan_refund_rollup(uuid)',
    'public.ticket_plan_part_refund_outcome(text, text, text, text, text)',
    'public.ticket_plan_admin_part_refund(uuid, text, text)',
    'public.ticket_plan_work_due()',
    'public.run_ticket_plan_dispatch()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

select cron.unschedule(j.jobname)
from cron.job j
where j.jobname = 'ticket-plans-dispatch';

select cron.schedule('ticket-plans-dispatch', '*/5 * * * *',
  $cron$select public.run_ticket_plan_dispatch();$cron$);

-- ---------------------------------------------------------------------------
-- 7. Admin permissions
-- ---------------------------------------------------------------------------

insert into public.admin_permission (key, label, description) values
  ('plans.view',      'View Pay small small plans',
     'See plans, what was paid towards them, and their refunds.'),
  ('plans.manage',    'Manage Pay small small plans',
     'End a plan with a refund, ask the provider again for a refused refund, or record a refund made by hand. Requires step-up.'),
  ('plans.configure', 'Configure Pay small small',
     'Switch Pay small small on or off, choose the audience and set the plan rules. Requires step-up.')
on conflict (key) do nothing;

insert into public.admin_role_permission (role_key, permission_key) values
  ('finance_admin', 'plans.view'),
  ('finance_admin', 'plans.manage'),
  ('finance_admin', 'plans.configure'),
  ('operations',    'plans.view'),
  ('operations',    'plans.configure'),
  ('support_admin', 'plans.view')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 8. Checks
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'ticket_plan_program_setting', 'event_ticket_plan_setting',
    'ticket_plan', 'ticket_plan_payment'
  ] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = format('public.%I', t)::regclass) then
      raise exception 'migration check: % has row level security off', t;
    end if;
    if has_table_privilege('anon', format('public.%I', t), 'select')
       or has_table_privilege('authenticated', format('public.%I', t), 'select')
       or has_table_privilege('authenticated', format('public.%I', t), 'insert')
       or has_table_privilege('authenticated', format('public.%I', t), 'update') then
      raise exception 'migration check: % is reachable from the apps', t;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.ticket_plan_release(uuid, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.ticket_plan_record_payment(uuid, bigint, bigint, text)', 'execute')
     or has_function_privilege('authenticated', 'public.issue_tickets_for_checkout(uuid, uuid, uuid, jsonb, timestamptz, jsonb)', 'execute') then
    raise exception 'migration check: a plan or issuance function is callable by the apps';
  end if;
  if (select enabled from public.ticket_plan_program_setting where id = 1) then
    raise exception 'migration check: Pay small small must ship switched off';
  end if;
  if not exists (select 1 from cron.job where jobname = 'ticket-plans-dispatch' and active) then
    raise exception 'migration check: the ticket-plans job is not scheduled';
  end if;
end;
$$;
