-- Gate partner connectors (2026-11-25, docs/architecture/gate-partner-connectors.md).
--
-- Some organizers keep their own check-in system at the gate (the
-- Ghana-Jamaica Homecoming Festival uses Hapniin) and will not run two.
-- Abonten can still sell their tickets: staff link the event to the
-- partner's event and map each ticket type to the partner's product, and
-- after every confirmed payment the sale is registered with the partner
-- ("pushed"), which issues its own ticket codes. The holder's ticket then
-- shows the PARTNER's code and QR; Abonten's own code stays on the row but
-- is never shown for these tickets.
--
--   gate_partner_link      one per event: provider, the partner's event id,
--                          the NAMES of the env variables holding the API
--                          key and webhook secret (never their values), the
--                          key's mode (live / sandbox), status.
--   gate_partner_product   each ticket type -> the partner's product, with
--                          the partner's price when it was linked (equal to
--                          ours: checked when linking and at every sale).
--   gate_partner_push      one per paid checkout line of a linked event,
--                          queued by a trigger in the same transaction as
--                          the payment; sent by the server (right after
--                          issuance, then the gate-partners job with
--                          backoff). Its idempotency key is derived from
--                          the checkout line.
--   gate_partner_ticket    each ticket's partner code, and whether it must
--                          be voided in the partner's system (the ticket was
--                          cancelled or refunded: the partner has no refund
--                          API yet, so the organizer is told).
--   gate_partner_rate_window  request counts per API key (the partner allows
--                          100 a minute; we stay under 90).
--   ticket.partner_gate / partner_code / partner_qr_public_id /
--   partner_qr_version     what the holder's ticket shows. Written only by
--                          the database (guard_ticket_client_update already
--                          refuses client changes to every other column).
--
-- Database rules (the services check the same things first, with words):
--   * a checkout written already paid or on a plan (a complimentary gift, a
--     pass choice, Pay small small) is refused for a linked event;
--   * a linked event's ticket prices, seating, group prices and dates
--     cannot change while it is linked (they would no longer match the
--     partner's products);
--   * a partner ticket cannot change hands (its code is the partner's).
--
-- Replaces no existing function. Every new table and function is service
-- role only. Ships with nothing linked; the feature flag
-- tickets.gate_partners (off) gates linking, GATE_PARTNERS_KILL_SWITCH
-- stops sales of linked events and holds the pushes.

begin;

-- ---------------------------------------------------------------------------
-- 1. What the holder's ticket shows
-- ---------------------------------------------------------------------------

alter table public.ticket
  add column if not exists partner_gate text,
  add column if not exists partner_code text,
  add column if not exists partner_qr_public_id text,
  add column if not exists partner_qr_version text;

alter table public.ticket
  drop constraint if exists ticket_partner_gate_check;
alter table public.ticket
  add constraint ticket_partner_gate_check
  check (partner_gate is null or partner_gate in ('hapniin'));

alter table public.ticket
  drop constraint if exists ticket_partner_code_check;
alter table public.ticket
  add constraint ticket_partner_code_check
  check (
    partner_code is null
    or (partner_gate is not null and length(partner_code) between 1 and 64)
  );

alter table public.ticket
  drop constraint if exists ticket_partner_qr_check;
alter table public.ticket
  add constraint ticket_partner_qr_check
  check (
    partner_qr_public_id is null
    or (partner_code is not null and partner_qr_public_id ~* '^[a-z0-9_\/-]+$')
  );

-- The door looks a scanned partner code up (to say where check-in happens).
create index if not exists ticket_partner_code_idx
  on public.ticket (upper(partner_code))
  where partner_code is not null;

comment on column public.ticket.partner_gate is
  'The partner whose gate system checks this ticket in (gate_partner_link.provider), set when the ticket is issued for a linked event. Null: Abonten''s own code is the entry code.';
comment on column public.ticket.partner_code is
  'The partner''s ticket code, shown as the ticket''s code and QR instead of ticket_code. Null while it is on its way. Written by gate_partner_store_codes() only.';

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.gate_partner_link (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null unique references public.event(id) on delete cascade,
  provider            text not null check (provider in ('hapniin')),
  partner_event_id    text not null check (length(partner_event_id) between 1 and 200),
  partner_event_title text check (partner_event_title is null or length(partner_event_title) <= 300),
  api_key_env         text not null,
  webhook_secret_env  text,
  key_mode            text not null check (key_mode in ('live', 'sandbox')),
  currency            text not null check (currency ~ '^[A-Z]{3}$'),
  status              text not null default 'active'
                      check (status in ('active', 'paused', 'ended')),
  check_problems      jsonb not null default '[]'::jsonb,
  checked_at          timestamptz not null default now(),
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  ended_at            timestamptz,
  -- Only the provider's own variable names: a free-form name could point
  -- the key at any server secret (as market_payment_provider's rule says).
  constraint gate_partner_link_env_names check (
    provider <> 'hapniin'
    or (
      api_key_env ~ '^HAPNIIN_API_KEY(_[A-Z0-9]{1,30})?$'
      and (webhook_secret_env is null
           or webhook_secret_env ~ '^HAPNIIN_WEBHOOK_SECRET(_[A-Z0-9]{1,30})?$')
    )
  ),
  constraint gate_partner_link_ended check ((status = 'ended') = (ended_at is not null))
);

create table if not exists public.gate_partner_product (
  link_id              uuid not null references public.gate_partner_link(id) on delete cascade,
  ticket_type_id       uuid not null unique references public.ticket_type(id) on delete cascade,
  partner_product_id   text not null check (length(partner_product_id) between 1 and 200),
  partner_product_name text check (partner_product_name is null or length(partner_product_name) <= 300),
  partner_price        numeric not null check (partner_price >= 0),
  created_at           timestamptz not null default now(),
  primary key (link_id, ticket_type_id),
  unique (link_id, partner_product_id)
);

create table if not exists public.gate_partner_push (
  id                    uuid primary key default gen_random_uuid(),
  link_id               uuid not null references public.gate_partner_link(id) on delete restrict,
  event_id              uuid not null references public.event(id) on delete cascade,
  checkout_id           uuid not null unique references public.ticket_checkout(id) on delete cascade,
  checkout_session_id   uuid not null,
  user_id               uuid not null,
  ticket_type_id        uuid not null,
  partner_product_id    text,
  status                text not null default 'queued'
                        check (status in ('queued', 'sending', 'ordered', 'done', 'failed', 'cancelled')),
  -- Bumped only by staff after the partner definitely refused the sale (a
  -- 4xx that created nothing), so a corrected retry is a new request; a
  -- timeout or a 5xx is always retried with the same key.
  generation            integer not null default 1 check (generation between 1 and 50),
  idempotency_key       text generated always as (
                          'abn-' || replace(checkout_id::text, '-', '') || '-g' || generation::text
                        ) stored,
  request_quantity      integer check (request_quantity is null or request_quantity > 0),
  request_ticket_ids    uuid[],
  attempts              integer not null default 0 check (attempts >= 0),
  next_attempt_at       timestamptz not null default now(),
  claimed_at            timestamptz,
  last_error_code       text check (last_error_code is null or length(last_error_code) <= 80),
  last_error_detail     text check (last_error_detail is null or length(last_error_detail) <= 500),
  last_http_status      integer,
  partner_order_id      text check (partner_order_id is null or length(partner_order_id) <= 200),
  partner_order_short_id text check (partner_order_short_id is null or length(partner_order_short_id) <= 200),
  partner_confirmed_at  timestamptz,
  codes_at              timestamptz,
  buyer_notified_at     timestamptz,
  incident_opened_at    timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint gate_partner_push_request check (
    (request_quantity is null) = (request_ticket_ids is null)
    and (request_ticket_ids is null or cardinality(request_ticket_ids) = request_quantity)
  )
);

create index if not exists gate_partner_push_due_idx
  on public.gate_partner_push (next_attempt_at)
  where status in ('queued', 'ordered');
create index if not exists gate_partner_push_sending_idx
  on public.gate_partner_push (claimed_at)
  where status = 'sending';
create index if not exists gate_partner_push_event_idx
  on public.gate_partner_push (event_id, status);
create index if not exists gate_partner_push_session_idx
  on public.gate_partner_push (checkout_session_id);
create index if not exists gate_partner_push_order_idx
  on public.gate_partner_push (partner_order_id)
  where partner_order_id is not null;

create table if not exists public.gate_partner_ticket (
  ticket_id             uuid primary key references public.ticket(id) on delete cascade,
  push_id               uuid not null references public.gate_partner_push(id) on delete cascade,
  event_id              uuid not null references public.event(id) on delete cascade,
  partner_attendee_id   text check (partner_attendee_id is null or length(partner_attendee_id) <= 200),
  partner_code          text not null unique check (length(partner_code) between 1 and 64),
  state                 text not null default 'issued'
                        check (state in ('issued', 'to_void', 'voided')),
  void_requested_at     timestamptz,
  organizer_notified_at timestamptz,
  voided_at             timestamptz,
  voided_by             uuid,
  voided_by_kind        text check (voided_by_kind is null or voided_by_kind in ('organizer', 'staff')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint gate_partner_ticket_states check (
    (state = 'issued' and void_requested_at is null and voided_at is null)
    or (state = 'to_void' and void_requested_at is not null and voided_at is null)
    or (state = 'voided' and void_requested_at is not null and voided_at is not null
        and voided_by_kind is not null)
  )
);

create index if not exists gate_partner_ticket_event_state_idx
  on public.gate_partner_ticket (event_id, state);
create index if not exists gate_partner_ticket_unnotified_idx
  on public.gate_partner_ticket (void_requested_at)
  where state = 'to_void' and organizer_notified_at is null;

create table if not exists public.gate_partner_rate_window (
  bucket       text not null check (length(bucket) between 1 and 120),
  window_start timestamptz not null,
  used         integer not null default 0 check (used >= 0),
  primary key (bucket, window_start)
);

do $rls$
declare
  t text;
begin
  foreach t in array array[
    'gate_partner_link', 'gate_partner_product', 'gate_partner_push',
    'gate_partner_ticket', 'gate_partner_rate_window'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end;
$rls$;

comment on table public.gate_partner_link is
  'An event whose gate is run by a partner''s check-in system (Hapniin first). Set by staff in Admin › Gate partners; holds env variable NAMES, never key values. Service role only (docs/architecture/gate-partner-connectors.md).';
comment on table public.gate_partner_product is
  'A linked event''s ticket type and the partner product it is registered as, with the partner''s price when linked. Service role only.';
comment on table public.gate_partner_push is
  'One paid checkout line of a linked event, registered with the partner by the server (queued by a trigger when the payment is confirmed). Service role only.';
comment on table public.gate_partner_ticket is
  'Each partner-gate ticket''s partner code and whether the organizer must void it in the partner''s system. Service role only.';
comment on table public.gate_partner_rate_window is
  'Requests made per partner API key per minute (the key''s env variable name, never its value). Service role only.';

-- ---------------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------------

-- A ticket issued for a linked event carries its partner (so the holder sees
-- "your gate code is on its way" until the code arrives).
create or replace function public.ticket_gate_partner_mark()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select l.provider into new.partner_gate
  from public.ticket_type tt
  join public.gate_partner_link l on l.event_id = tt.event_id
  where tt.id = new.ticket_type_id
    and l.status in ('active', 'paused');
  return new;
end;
$$;

drop trigger if exists ticket_gate_partner_mark on public.ticket;
create trigger ticket_gate_partner_mark
  before insert on public.ticket
  for each row execute function public.ticket_gate_partner_mark();

-- A partner ticket's code is the partner's: it never changes hands here.
create or replace function public.ticket_gate_partner_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'Tickets for this event cannot be sent to someone else.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_gate_partner_guard on public.ticket;
create trigger ticket_gate_partner_guard
  before update of user_id on public.ticket
  for each row
  when (old.partner_gate is not null)
  execute function public.ticket_gate_partner_guard();

-- A cancelled or refunded partner ticket must be voided in the partner's
-- system: the partner cannot be told by API yet, so the organizer is
-- (the gate-partners job collects these and notifies them).
create or replace function public.ticket_gate_partner_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.gate_partner_ticket g
  set state = 'to_void',
      void_requested_at = now(),
      updated_at = now()
  where g.ticket_id = new.id
    and g.state = 'issued';
  return null;
end;
$$;

drop trigger if exists ticket_gate_partner_cancelled on public.ticket;
create trigger ticket_gate_partner_cancelled
  after update of status on public.ticket
  for each row
  when (new.status = 'cancelled' and old.status is distinct from 'cancelled'
        and new.partner_gate is not null)
  execute function public.ticket_gate_partner_cancelled();

-- A paid checkout line of a linked event is queued for the partner in the
-- same transaction as the payment. A line written already paid or on a
-- plan (a complimentary gift, a pass choice, Pay small small) is refused:
-- there is no sale to register and the partner would price it anyway.
create or replace function public.ticket_checkout_gate_partner_queue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link    public.gate_partner_link%rowtype;
  v_product text;
begin
  select * into v_link
  from public.gate_partner_link
  where event_id = new.event_id and status in ('active', 'paused');
  if not found then
    return null;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Tickets for this event are issued through the organizer''s gate system; they can only be bought.'
      using errcode = 'check_violation';
  end if;

  select p.partner_product_id into v_product
  from public.gate_partner_product p
  where p.link_id = v_link.id and p.ticket_type_id = new.ticket_type_id;

  insert into public.gate_partner_push (
    link_id, event_id, checkout_id, checkout_session_id, user_id,
    ticket_type_id, partner_product_id, status,
    last_error_code, last_error_detail
  ) values (
    v_link.id, new.event_id, new.id, new.checkout_session_id, new.user_id,
    new.ticket_type_id, v_product,
    case when v_product is null then 'failed' else 'queued' end,
    case when v_product is null then 'NOT_MAPPED' end,
    case when v_product is null then 'This ticket type has no partner product.' end
  )
  on conflict (checkout_id) do nothing;
  return null;
end;
$$;

drop trigger if exists ticket_checkout_gate_partner_paid on public.ticket_checkout;
create trigger ticket_checkout_gate_partner_paid
  after update of status on public.ticket_checkout
  for each row
  when (new.status = 'paid' and old.status is distinct from 'paid')
  execute function public.ticket_checkout_gate_partner_queue();

drop trigger if exists ticket_checkout_gate_partner_insert on public.ticket_checkout;
create trigger ticket_checkout_gate_partner_insert
  after insert on public.ticket_checkout
  for each row
  when (new.status in ('paid', 'on_plan'))
  execute function public.ticket_checkout_gate_partner_queue();

-- While an event is linked its tickets must stay what the partner sells:
-- no new ticket type, no price / admits / amount / pass / seating change,
-- no group prices, no extra dates, no seating plan. Stock and notes stay
-- editable. Unlink first (only possible before the first sale).
create or replace function public.gate_partner_refuse_while_linked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.gate_partner_link l
    where l.event_id = new.event_id and l.status <> 'ended'
  ) then
    raise exception 'This event''s tickets are linked to the organizer''s gate system and cannot be changed.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_type_gate_partner_guard on public.ticket_type;
create trigger ticket_type_gate_partner_guard
  before insert on public.ticket_type
  for each row execute function public.gate_partner_refuse_while_linked();

-- Only a real change counts: an editor that writes every column back with
-- the same values (and stock moving with sales) is not one.
drop trigger if exists ticket_type_gate_partner_change_guard on public.ticket_type;
create trigger ticket_type_gate_partner_change_guard
  before update of price, currency, admits, amount_mode, min_amount,
    max_amount, amount_step, pass_shows, seating_section_id, event_id
  on public.ticket_type
  for each row
  when (old.price is distinct from new.price
        or old.currency is distinct from new.currency
        or old.admits is distinct from new.admits
        or old.amount_mode is distinct from new.amount_mode
        or old.min_amount is distinct from new.min_amount
        or old.max_amount is distinct from new.max_amount
        or old.amount_step is distinct from new.amount_step
        or old.pass_shows is distinct from new.pass_shows
        or old.seating_section_id is distinct from new.seating_section_id
        or old.event_id is distinct from new.event_id)
  execute function public.gate_partner_refuse_while_linked();

drop trigger if exists event_group_discount_gate_partner_guard on public.event_group_discount;
create trigger event_group_discount_gate_partner_guard
  before insert or update on public.event_group_discount
  for each row execute function public.gate_partner_refuse_while_linked();

drop trigger if exists event_occurrence_gate_partner_guard on public.event_occurrence;
create trigger event_occurrence_gate_partner_guard
  before insert on public.event_occurrence
  for each row execute function public.gate_partner_refuse_while_linked();

drop trigger if exists event_seating_gate_partner_guard on public.event_seating;
create trigger event_seating_gate_partner_guard
  before insert or update on public.event_seating
  for each row execute function public.gate_partner_refuse_while_linked();

-- ---------------------------------------------------------------------------
-- 4. Linking (staff, through @abonten/services/admin/gatePartners)
-- ---------------------------------------------------------------------------

-- Why an event cannot be linked, as codes (the service words them). The
-- TypeScript twin is @abonten/core/gatePartners/gateLinkRules.
create or replace function public.gate_partner_event_problems(p_event_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event    public.event%rowtype;
  v_problems text[] := '{}';
begin
  select * into v_event from public.event where id = p_event_id;
  if not found then
    return array['not_found'];
  end if;
  if v_event.status is distinct from 'published' then
    v_problems := array_append(v_problems, 'not_published');
  end if;
  if v_event.postponed_at is not null then
    v_problems := array_append(v_problems, 'postponed');
  end if;
  if exists (select 1 from public.event_seating s where s.event_id = p_event_id)
     or exists (select 1 from public.ticket_type t
                where t.event_id = p_event_id and t.seating_section_id is not null) then
    v_problems := array_append(v_problems, 'seated');
  end if;
  if exists (select 1 from public.event_occurrence o where o.event_id = p_event_id) then
    v_problems := array_append(v_problems, 'multi_date');
  end if;
  if not exists (select 1 from public.ticket_type t where t.event_id = p_event_id) then
    v_problems := array_append(v_problems, 'no_tickets');
  end if;
  if exists (select 1 from public.ticket_type t
             where t.event_id = p_event_id and coalesce(t.amount_mode, 'fixed') <> 'fixed') then
    v_problems := array_append(v_problems, 'open_amount');
  end if;
  if exists (select 1 from public.ticket_type t
             where t.event_id = p_event_id and coalesce(t.admits, 1) <> 1) then
    v_problems := array_append(v_problems, 'group_ticket');
  end if;
  if exists (select 1 from public.ticket_type t
             where t.event_id = p_event_id and t.pass_shows is not null) then
    v_problems := array_append(v_problems, 'pass');
  end if;
  if exists (select 1 from public.event_group_discount g where g.event_id = p_event_id) then
    v_problems := array_append(v_problems, 'group_prices');
  end if;
  if exists (select 1 from public.ticket_type t
             where t.event_id = p_event_id
               and (t.type = 'FREE' or coalesce(t.price, 0) <= 0)) then
    v_problems := array_append(v_problems, 'free_ticket');
  end if;
  -- Before the first sale: every ticket must carry the partner's code.
  if exists (select 1 from public.ticket_checkout c
             where c.event_id = p_event_id
               and c.status in ('pending', 'on_plan', 'paid'))
     or exists (select 1 from public.ticket tk
                join public.ticket_type t on t.id = tk.ticket_type_id
                where t.event_id = p_event_id and tk.status in ('active', 'used')) then
    v_problems := array_append(v_problems, 'has_sales');
  end if;
  return v_problems;
end;
$$;

-- Links (or re-links, before the first sale) an event, with its products,
-- in one transaction. The ticket types are locked so a reservation cannot
-- slip in between the check and the link. p_products:
-- [{ ticket_type_id, partner_product_id, partner_product_name, partner_price }]
-- covering every ticket type of the event exactly once.
create or replace function public.gate_partner_link_set(
  p_event_id            uuid,
  p_provider            text,
  p_partner_event_id    text,
  p_partner_event_title text,
  p_api_key_env         text,
  p_webhook_secret_env  text,
  p_key_mode            text,
  p_currency            text,
  p_products            jsonb,
  p_check_problems      jsonb,
  p_staff_id            uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problems text[];
  v_link     uuid;
  v_types    integer;
  v_given    integer;
begin
  perform 1 from public.event where id = p_event_id for update;
  perform 1 from public.ticket_type where event_id = p_event_id for update;

  v_problems := public.gate_partner_event_problems(p_event_id);
  if cardinality(v_problems) > 0 then
    raise exception 'This event cannot be linked: %', array_to_string(v_problems, ', ')
      using errcode = 'check_violation';
  end if;

  select count(*) into v_types from public.ticket_type where event_id = p_event_id;
  select count(distinct (x->>'ticket_type_id')) into v_given
  from jsonb_array_elements(coalesce(p_products, '[]'::jsonb)) x
  join public.ticket_type t
    on t.id = (x->>'ticket_type_id')::uuid and t.event_id = p_event_id;
  if v_given <> v_types or jsonb_array_length(coalesce(p_products, '[]'::jsonb)) <> v_types then
    raise exception 'Map every ticket type of the event to one partner product.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.ticket_type t
    where t.event_id = p_event_id and t.currency is distinct from p_currency
  ) then
    raise exception 'The partner sells in another currency.'
      using errcode = 'check_violation';
  end if;

  -- The partner's price must be ours, to the currency's smallest unit.
  if exists (
    select 1
    from jsonb_array_elements(p_products) x
    join public.ticket_type t on t.id = (x->>'ticket_type_id')::uuid
    where public.money_round((x->>'partner_price')::numeric, p_currency)
          is distinct from public.money_round(t.price, p_currency)
  ) then
    raise exception 'A partner price differs from the Abonten price.'
      using errcode = 'check_violation';
  end if;

  delete from public.gate_partner_link
  where event_id = p_event_id and status = 'ended';

  insert into public.gate_partner_link (
    event_id, provider, partner_event_id, partner_event_title, api_key_env,
    webhook_secret_env, key_mode, currency, status, check_problems,
    checked_at, created_by
  ) values (
    p_event_id, p_provider, p_partner_event_id, p_partner_event_title,
    p_api_key_env, p_webhook_secret_env, p_key_mode, p_currency, 'active',
    coalesce(p_check_problems, '[]'::jsonb), now(), p_staff_id
  )
  on conflict (event_id) do update
    set provider = excluded.provider,
        partner_event_id = excluded.partner_event_id,
        partner_event_title = excluded.partner_event_title,
        api_key_env = excluded.api_key_env,
        webhook_secret_env = excluded.webhook_secret_env,
        key_mode = excluded.key_mode,
        currency = excluded.currency,
        status = 'active',
        ended_at = null,
        check_problems = excluded.check_problems,
        checked_at = now(),
        updated_at = now()
  returning id into v_link;

  delete from public.gate_partner_product where link_id = v_link;
  insert into public.gate_partner_product (
    link_id, ticket_type_id, partner_product_id, partner_product_name, partner_price
  )
  select v_link,
         (x->>'ticket_type_id')::uuid,
         x->>'partner_product_id',
         nullif(x->>'partner_product_name', ''),
         (x->>'partner_price')::numeric
  from jsonb_array_elements(p_products) x;

  return v_link;
end;
$$;

-- Ends a link. Only before the first sale: once a sale was registered with
-- the partner, its tickets carry partner codes and the link stays (pause
-- it to stop selling).
create or replace function public.gate_partner_link_end(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.gate_partner_link%rowtype;
begin
  select * into v_link from public.gate_partner_link
  where event_id = p_event_id for update;
  if not found or v_link.status = 'ended' then
    return false;
  end if;
  if exists (select 1 from public.gate_partner_push p where p.link_id = v_link.id)
     or exists (select 1 from public.ticket tk
                join public.ticket_type t on t.id = tk.ticket_type_id
                where t.event_id = p_event_id and tk.partner_gate is not null)
     or exists (select 1 from public.ticket_checkout c
                where c.event_id = p_event_id and c.status in ('pending', 'on_plan')) then
    raise exception 'Tickets were already sold through this link; pause it instead.'
      using errcode = 'check_violation';
  end if;
  update public.gate_partner_link
  set status = 'ended', ended_at = now(), updated_at = now()
  where id = v_link.id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Sending (the gate-partners job and the server right after issuance)
-- ---------------------------------------------------------------------------

-- Due pushes, claimed with row locks so two senders never send one twice.
-- A push left 'sending' for five minutes (a sender that died) is due again,
-- with the same idempotency key, so the partner replays its first answer.
create or replace function public.gate_partner_push_claim(
  p_limit   integer default 20,
  p_session uuid default null
)
returns setof public.gate_partner_push
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.gate_partner_push p
  set status = case when p.partner_order_id is null then 'queued' else 'ordered' end,
      claimed_at = null,
      updated_at = now()
  where p.status = 'sending'
    and p.claimed_at < now() - interval '5 minutes';

  return query
  with c as (
    select p.id
    from public.gate_partner_push p
    join public.gate_partner_link l on l.id = p.link_id
    where p.status in ('queued', 'ordered')
      and p.next_attempt_at <= now()
      and l.status <> 'ended'
      and (p_session is null or p.checkout_session_id = p_session)
    order by p.next_attempt_at, p.created_at
    limit greatest(least(coalesce(p_limit, 20), 100), 1)
    for update of p skip locked
  )
  update public.gate_partner_push p
  set status = 'sending',
      claimed_at = now(),
      attempts = p.attempts + 1,
      updated_at = now()
  from c
  where p.id = c.id
  returning p.*;
end;
$$;

-- The partner's codes for a push's tickets, in one transaction: each
-- ticket gets its code and QR, the code is recorded (straight to "to void"
-- when the ticket was cancelled meanwhile), and the push is done.
-- p_codes: [{ ticket_id, attendee_id, code, qr_public_id, qr_version }].
create or replace function public.gate_partner_store_codes(p_push_id uuid, p_codes jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_push     public.gate_partner_push%rowtype;
  v_provider text;
  v_row      jsonb;
  v_ticket   public.ticket%rowtype;
  v_code     text;
  v_count    integer := 0;
begin
  select * into v_push from public.gate_partner_push where id = p_push_id for update;
  if not found then
    raise exception 'gate_partner_store_codes: no such push';
  end if;
  if v_push.status = 'done' then
    return 0;
  end if;
  if v_push.partner_order_id is null then
    raise exception 'gate_partner_store_codes: the partner order is not recorded';
  end if;
  select provider into v_provider from public.gate_partner_link where id = v_push.link_id;

  for v_row in select * from jsonb_array_elements(coalesce(p_codes, '[]'::jsonb)) loop
    select * into v_ticket from public.ticket
    where id = (v_row->>'ticket_id')::uuid
    for update;
    if not found or v_ticket.ticket_checkout_id is distinct from v_push.checkout_id then
      raise exception 'gate_partner_store_codes: ticket % is not part of this sale', v_row->>'ticket_id';
    end if;
    v_code := nullif(btrim(v_row->>'code'), '');
    if v_code is null then
      raise exception 'gate_partner_store_codes: a code is missing';
    end if;

    insert into public.gate_partner_ticket (
      ticket_id, push_id, event_id, partner_attendee_id, partner_code,
      state, void_requested_at
    ) values (
      v_ticket.id, v_push.id, v_push.event_id, nullif(v_row->>'attendee_id', ''), v_code,
      case when v_ticket.status = 'cancelled' then 'to_void' else 'issued' end,
      case when v_ticket.status = 'cancelled' then now() end
    )
    on conflict (ticket_id) do nothing;

    update public.ticket
    set partner_gate = coalesce(partner_gate, v_provider),
        partner_code = v_code,
        partner_qr_public_id = nullif(v_row->>'qr_public_id', ''),
        partner_qr_version = nullif(v_row->>'qr_version', '')
    where id = v_ticket.id;
    v_count := v_count + 1;
  end loop;

  update public.gate_partner_push
  set status = 'done',
      codes_at = now(),
      claimed_at = null,
      last_error_code = null,
      last_error_detail = null,
      last_http_status = null,
      updated_at = now()
  where id = p_push_id;
  return v_count;
end;
$$;

-- At most p_limit requests a minute per API key (a sliding window over two
-- one-minute buckets). Returns 0 when the request may go now, else the
-- seconds to wait. The bucket is the key's env variable NAME.
create or replace function public.gate_partner_rate_take(
  p_bucket text,
  p_cost   integer default 1,
  p_limit  integer default 90
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now      timestamptz := clock_timestamp();
  v_window   timestamptz := date_trunc('minute', clock_timestamp());
  v_elapsed  numeric;
  v_cur      integer;
  v_prev     integer;
begin
  if p_bucket is null or p_cost is null or p_cost < 1 or p_limit is null or p_limit < 1 then
    raise exception 'gate_partner_rate_take: bad arguments';
  end if;
  insert into public.gate_partner_rate_window (bucket, window_start, used)
  values (p_bucket, v_window, 0)
  on conflict do nothing;
  select used into v_cur from public.gate_partner_rate_window
  where bucket = p_bucket and window_start = v_window
  for update;
  select coalesce(max(used), 0) into v_prev from public.gate_partner_rate_window
  where bucket = p_bucket and window_start = v_window - interval '1 minute';
  v_elapsed := extract(epoch from (v_now - v_window));
  if v_prev * (1 - v_elapsed / 60.0) + v_cur + p_cost > p_limit then
    return greatest(1, ceil(60 - v_elapsed)::integer);
  end if;
  update public.gate_partner_rate_window
  set used = used + p_cost
  where bucket = p_bucket and window_start = v_window;
  delete from public.gate_partner_rate_window
  where bucket = p_bucket and window_start < v_window - interval '5 minutes';
  return 0;
end;
$$;

-- Tickets the organizer must void that nobody has told them about yet,
-- claimed (marked told) with row locks; the service puts the mark back if
-- the notice could not be written.
create or replace function public.gate_partner_void_claim(p_limit integer default 500)
returns table (ticket_id uuid, event_id uuid, partner_code text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with c as (
    select g.ticket_id
    from public.gate_partner_ticket g
    where g.state = 'to_void' and g.organizer_notified_at is null
    order by g.void_requested_at
    limit greatest(least(coalesce(p_limit, 500), 2000), 1)
    for update skip locked
  )
  update public.gate_partner_ticket g
  set organizer_notified_at = now(), updated_at = now()
  from c
  where g.ticket_id = c.ticket_id
  returning g.ticket_id, g.event_id, g.partner_code;
end;
$$;

create or replace function public.gate_partner_work_due()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gate_partner_push p
    where p.status in ('queued', 'ordered') and p.next_attempt_at <= now()
  ) or exists (
    select 1 from public.gate_partner_push p
    where p.status = 'sending' and p.claimed_at < now() - interval '5 minutes'
  ) or exists (
    select 1 from public.gate_partner_ticket g
    where g.state = 'to_void' and g.organizer_notified_at is null
  );
$$;

-- pg_cron gate-partners, every minute, only while something is due: POSTs
-- to /api/jobs/gate-partners on the host of the notification-delivery
-- route, with its token (no new configuration).
create or replace function public.run_gate_partner_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg public.notification_delivery_config;
  v_url text;
begin
  if not public.gate_partner_work_due() then
    return;
  end if;

  select * into v_cfg from public.notification_delivery_config where id = true;
  if v_cfg.dispatch_url is null then
    return;
  end if;
  v_url := regexp_replace(v_cfg.dispatch_url, '/api/notifications/deliver/?$', '/api/jobs/gate-partners');
  if v_url = v_cfg.dispatch_url then
    return;
  end if;

  perform net.http_post(
    url                  := v_url,
    body                 := '{}'::jsonb,
    headers              := jsonb_build_object('Content-Type', 'application/json',
                                               'x-delivery-token', v_cfg.token),
    timeout_milliseconds := 30000
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------

do $grants$
declare
  fn text;
begin
  foreach fn in array array[
    'public.ticket_gate_partner_mark()',
    'public.ticket_gate_partner_guard()',
    'public.ticket_gate_partner_cancelled()',
    'public.ticket_checkout_gate_partner_queue()',
    'public.gate_partner_refuse_while_linked()',
    'public.gate_partner_event_problems(uuid)',
    'public.gate_partner_link_set(uuid, text, text, text, text, text, text, text, jsonb, jsonb, uuid)',
    'public.gate_partner_link_end(uuid)',
    'public.gate_partner_push_claim(integer, uuid)',
    'public.gate_partner_store_codes(uuid, jsonb)',
    'public.gate_partner_rate_take(text, integer, integer)',
    'public.gate_partner_void_claim(integer)',
    'public.gate_partner_work_due()',
    'public.run_gate_partner_dispatch()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$grants$;

-- ---------------------------------------------------------------------------
-- 7. The job, the switch, the admin permissions
-- ---------------------------------------------------------------------------

select cron.unschedule(j.jobname)
from cron.job j
where j.jobname = 'gate-partners';

select cron.schedule('gate-partners', '* * * * *',
  $cron$select public.run_gate_partner_dispatch();$cron$);

insert into public.feature_flag (key, description, enabled, rules) values
  ('tickets.gate_partners',
   'Gate partner connectors: staff may link this organizer''s events to the organizer''s own check-in system (Hapniin). allowSubjects: the organizer''s account or team id',
   false,
   '{"allowSubjects": [], "percent": 0}'::jsonb)
on conflict (key) do nothing;

insert into public.admin_permission (key, label, description) values
  ('gatepartners.view', 'View gate partner links',
     'See which events sell tickets checked in by an organiser''s own gate system (Hapniin), the sales registered with it, the ones stuck, and the codes to void.'),
  ('gatepartners.manage', 'Manage gate partner links',
     'Link an event to a partner''s event and products, pause or end a link, retry a stuck registration, and record codes as voided. Fresh step-up; audited.')
on conflict (key) do nothing;

-- super_admin is granted everything in code (its rows are immutable).
insert into public.admin_role_permission (role_key, permission_key) values
  ('operations',    'gatepartners.view'),
  ('operations',    'gatepartners.manage'),
  ('finance_admin', 'gatepartners.view'),
  ('finance_admin', 'gatepartners.manage'),
  ('support_admin', 'gatepartners.view')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 8. Checks
-- ---------------------------------------------------------------------------

do $check$
declare
  t text;
begin
  foreach t in array array[
    'gate_partner_link', 'gate_partner_product', 'gate_partner_push',
    'gate_partner_ticket', 'gate_partner_rate_window'
  ] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = format('public.%I', t)::regclass) then
      raise exception 'migration check: % has row level security off', t;
    end if;
    if has_table_privilege('anon', format('public.%I', t), 'select')
       or has_table_privilege('authenticated', format('public.%I', t), 'select')
       or has_table_privilege('authenticated', format('public.%I', t), 'insert')
       or has_table_privilege('authenticated', format('public.%I', t), 'update') then
      raise exception 'migration check: % is open to clients', t;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.gate_partner_store_codes(uuid, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.gate_partner_link_set(uuid, text, text, text, text, text, text, text, jsonb, jsonb, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.run_gate_partner_dispatch()', 'execute') then
    raise exception 'migration check: gate partner functions are service role only';
  end if;
  if not exists (select 1 from cron.job where jobname = 'gate-partners' and active) then
    raise exception 'migration check: the gate-partners job is not scheduled';
  end if;
  if (select count(*) from public.admin_permission
      where key in ('gatepartners.view', 'gatepartners.manage')) <> 2 then
    raise exception 'migration check: gate partner permissions missing';
  end if;
  if (select enabled from public.feature_flag where key = 'tickets.gate_partners') then
    raise exception 'migration check: tickets.gate_partners must ship off';
  end if;
end;
$check$;

commit;
