-- Refunding one ticket of a payment (2026-10-30).
--
-- A refund used to cover a whole payment: issueRefundCore asked the
-- provider for the ticket revenue of every ticket the charge paid for, so a
-- buyer who cancelled one of three tickets got nothing back until the other
-- two were cancelled too, and the cancelled seat went back on sale (a pilot
-- tester lost a ticket's price that way). Now each cancellation is refunded
-- on its own: "I bought three, one friend can't come" gives that ticket's
-- price back and leaves the other two valid.
--
-- transaction_refund holds one row per refund asked of the provider, for
-- part or all of a payment; transaction_refund_ticket says which tickets it
-- covers (a ticket is covered by at most one refund that has not failed).
-- The amounts are cumulative per checkout line, so the parts add up to the
-- line exactly: three tickets of a GH₵100 line come back as 33.33, 33.34
-- and 33.33, never one pesewa more or less than was paid. The service fee
-- is kept, as before.
--
-- A refund moves through these functions only (service role only):
--   refund_prepare        picks the cancelled tickets no live refund covers
--                         and records the refund ('preparing'), under a
--                         lock on the payment; one at a time per payment
--   refund_mark_requested once the provider accepted: 'requested', the
--                         organizer's hold for those tickets, and for the
--                         last tickets of the payment the payment itself
--                         moves to refund_pending as before
--   refund_mark_outcome   the provider's answer (webhook, or a refusal
--                         when asking): 'processed' records the fee audit
--                         row; 'failed' gives the hold back and leaves the
--                         tickets uncovered, so "Retry refund" asks again
--   refund_match          which refund a provider event is about
--   refund_quote_amount   what cancelling given tickets would give back
--
-- A partial refund leaves transaction.status 'successful' and does not set
-- refund_requested_at (that pair still means "the whole refund failed").
-- Payments made partly with Abonten Credit and Pay small small purchases
-- (provider abonten_plan) keep the original whole-payment path: their money
-- came back through the credit ledger and through each part's own charge,
-- which are refunded once per payment.

create table public.transaction_refund (
  id                 uuid primary key default gen_random_uuid(),
  transaction_id     uuid not null references public.transaction(id) on delete cascade,
  user_id            uuid not null,
  currency           text not null,
  amount             numeric not null check (amount >= 0),
  completes_payment  boolean not null default false,
  status             text not null default 'preparing'
                     check (status in ('preparing', 'requested', 'processed', 'failed')),
  provider_refund_id text,
  failure_detail     text,
  created_at         timestamptz not null default now(),
  requested_at       timestamptz,
  processed_at       timestamptz,
  failed_at          timestamptz
);

create index transaction_refund_transaction_idx
  on public.transaction_refund (transaction_id, created_at);
create index transaction_refund_open_idx
  on public.transaction_refund (transaction_id)
  where status in ('preparing', 'requested');
create index transaction_refund_provider_idx
  on public.transaction_refund (provider_refund_id)
  where provider_refund_id is not null;

create table public.transaction_refund_ticket (
  refund_id uuid not null references public.transaction_refund(id) on delete cascade,
  ticket_id uuid not null references public.ticket(id) on delete cascade,
  primary key (refund_id, ticket_id)
);

create index transaction_refund_ticket_ticket_idx
  on public.transaction_refund_ticket (ticket_id);

-- Buyers read their own refunds (the ticket screens show each cancelled
-- ticket's refund); nobody writes them but the functions below.
alter table public.transaction_refund enable row level security;
alter table public.transaction_refund_ticket enable row level security;
revoke all on table public.transaction_refund from anon, authenticated;
revoke all on table public.transaction_refund_ticket from anon, authenticated;
grant select on table public.transaction_refund to authenticated;
grant select on table public.transaction_refund_ticket to authenticated;
grant all on table public.transaction_refund to service_role;
grant all on table public.transaction_refund_ticket to service_role;

create policy transaction_refund_owner_select
  on public.transaction_refund for select to authenticated
  using (user_id = (select auth.uid()));

create policy transaction_refund_ticket_owner_select
  on public.transaction_refund_ticket for select to authenticated
  using (exists (
    select 1 from public.transaction_refund r
    where r.id = transaction_refund_ticket.refund_id
      and r.user_id = (select auth.uid())
  ));

-- Which refund an organizer hold or a fee audit row belongs to. No foreign
-- key: both ledgers are append-only and outlive the rows they describe.
alter table public.organizer_ledger_entry add column refund_id uuid;
create index organizer_ledger_entry_refund_idx
  on public.organizer_ledger_entry (refund_id)
  where refund_id is not null;

alter table public.platform_fee_entry add column refund_id uuid;
drop index public.platform_fee_entry_refund_once;
create unique index platform_fee_entry_refund_once
  on public.platform_fee_entry (transaction_id)
  where entry_type = 'fee_refund_adjustment' and refund_id is null;
create unique index platform_fee_entry_refund_part_once
  on public.platform_fee_entry (refund_id)
  where entry_type = 'fee_refund_adjustment' and refund_id is not null;

-- The whole-payment path's audit row, unchanged but for the conflict target
-- (its unique index now covers rows without a refund_id only).
create or replace function public.record_fee_refund_adjustment(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fee_row    public.platform_fee_entry%rowtype;
  v_refundable numeric;
begin
  select * into v_fee_row
  from public.platform_fee_entry
  where transaction_id = p_transaction_id and entry_type = 'fee';

  if not found then
    return;
  end if;

  v_refundable := public.get_transaction_refundable_amount(p_transaction_id);

  insert into public.platform_fee_entry (
    transaction_id, event_id, entry_type,
    ticket_revenue, service_fee, total_customer_payment,
    processing_cost, net_revenue, fee_rate, currency
  ) values (
    p_transaction_id,
    v_fee_row.event_id,
    'fee_refund_adjustment',
    -1 * v_refundable,
    0,
    -1 * v_refundable,
    0,   -- Paystack keeps its charge fee on a refund and reports no separate
         -- per-refund processing cost.
    0,   -- The service fee is retained: no net-revenue impact.
    v_fee_row.fee_rate,
    v_fee_row.currency
  )
  on conflict (transaction_id)
    where entry_type = 'fee_refund_adjustment' and refund_id is null
    do nothing;
end;
$$;

-- What refunding these tickets would give back now: per checkout line, the
-- line's price for every unit covered once they are refunded, less the
-- price for the units already covered (a refund that failed covers none).
create or replace function public._refund_amount(
  p_transaction_id uuid,
  p_new_tickets    uuid[]
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
           public.money_round(tc.total_price * (l.before_units + l.new_units) / nullif(tc.quantity, 0), tt.currency)
         - public.money_round(tc.total_price * l.before_units / nullif(tc.quantity, 0), tt.currency)
         ), 0)
  from (
    select t.ticket_checkout_id,
           count(*) filter (where t.id = any(p_new_tickets)) as new_units,
           count(*) filter (
             where not (t.id = any(p_new_tickets))
               and exists (
                 select 1
                 from public.transaction_refund_ticket rt
                 join public.transaction_refund r on r.id = rt.refund_id
                 where rt.ticket_id = t.id and r.status <> 'failed'
               )
           ) as before_units
    from public.ticket t
    where t.transaction_id = p_transaction_id
      and t.ticket_checkout_id is not null
    group by t.ticket_checkout_id
  ) l
  join public.ticket_checkout tc on tc.id = l.ticket_checkout_id
  join public.ticket_type tt on tt.id = tc.ticket_type_id
  where l.new_units > 0;
$$;

create or replace function public.refund_quote_amount(
  p_transaction_id uuid,
  p_ticket_ids     uuid[]
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select public._refund_amount(p_transaction_id, p_ticket_ids);
$$;

create or replace function public.refund_prepare(p_transaction_id uuid)
returns setof public.transaction_refund
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_txn           public.transaction%rowtype;
  v_new           uuid[];
  v_all_cancelled boolean;
  v_has_lines     boolean;
  v_before        numeric;
  v_amount        numeric;
  v_refund        public.transaction_refund%rowtype;
begin
  select * into v_txn from public.transaction where id = p_transaction_id for update;
  if not found then
    raise exception 'Transaction not found' using errcode = 'P0002';
  end if;
  if v_txn.status <> 'successful' then
    return;
  end if;
  if coalesce(v_txn.credit_amount, 0) > 0 or v_txn.provider = 'abonten_plan' then
    raise exception 'This payment is refunded as a whole' using errcode = '22023';
  end if;

  -- One refund at a time per payment. A refund left 'preparing' for longer
  -- was abandoned mid-request (the caller never came back): it covers its
  -- tickets no more, as the whole-payment claim expired after two minutes.
  if exists (
    select 1 from public.transaction_refund r
    where r.transaction_id = p_transaction_id
      and r.status = 'preparing'
      and r.created_at > now() - interval '2 minutes'
  ) then
    raise exception 'A refund for this payment is being requested' using errcode = '55P03';
  end if;
  update public.transaction_refund
  set status = 'failed',
      failed_at = now(),
      failure_detail = 'abandoned before the provider answered'
  where transaction_id = p_transaction_id and status = 'preparing';

  select coalesce(array_agg(t.id order by t.id), '{}'::uuid[]) into v_new
  from public.ticket t
  where t.transaction_id = p_transaction_id
    and t.status = 'cancelled'
    and not exists (
      select 1
      from public.transaction_refund_ticket rt
      join public.transaction_refund r on r.id = rt.refund_id
      where rt.ticket_id = t.id and r.status <> 'failed'
    );
  if cardinality(v_new) = 0 then
    return;
  end if;

  select not exists (
    select 1 from public.ticket t
    where t.transaction_id = p_transaction_id and t.status <> 'cancelled'
  ) into v_all_cancelled;
  select exists (
    select 1 from public.ticket t
    where t.transaction_id = p_transaction_id and t.ticket_checkout_id is not null
  ) into v_has_lines;
  select coalesce(sum(r.amount), 0) into v_before
  from public.transaction_refund r
  where r.transaction_id = p_transaction_id and r.status <> 'failed';

  v_amount := public._refund_amount(p_transaction_id, v_new);
  -- Tickets with no checkout line (early data) have no price of their own:
  -- the whole payment comes back, as the whole-payment path did.
  if v_all_cancelled and not v_has_lines then
    v_amount := v_txn.amount - v_before;
  end if;
  -- Never more than the charge took.
  v_amount := greatest(least(v_amount, v_txn.amount - v_before), 0);

  insert into public.transaction_refund (
    transaction_id, user_id, currency, amount, completes_payment
  ) values (
    p_transaction_id, v_txn.user_id, v_txn.currency, v_amount, v_all_cancelled
  )
  returning * into v_refund;

  insert into public.transaction_refund_ticket (refund_id, ticket_id)
  select v_refund.id, x from unnest(v_new) as x;

  -- The last tickets: the payment reads as being refunded (and, should the
  -- provider refuse, as a failed refund with Retry) exactly as before.
  if v_all_cancelled then
    update public.transaction
    set refund_requested_at = coalesce(refund_requested_at, now()),
        updated_at = now()
    where id = p_transaction_id;
  end if;

  return next v_refund;
  return;
end;
$$;

-- The organizer's hold for a refund: per checkout line it touches, the
-- line's earning for every unit live refunds cover, less what is held
-- already (holds and releases of earlier refunds included), so the holds of
-- a line's parts add up to its earning.
create or replace function public._refund_hold(p_refund_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.transaction_refund%rowtype;
  rec      record;
begin
  select * into v_refund from public.transaction_refund where id = p_refund_id;
  if not found or exists (
    select 1 from public.organizer_ledger_entry
    where refund_id = p_refund_id and entry_type = 'refund_hold'
  ) then
    return;
  end if;

  -- Same lock order as request_organizer_payout and record_refund_hold.
  for rec in
    select distinct le.organizer_id, le.currency
    from public.transaction_refund_ticket rt
    join public.ticket t on t.id = rt.ticket_id
    join public.organizer_ledger_entry le
      on le.ticket_checkout_id = t.ticket_checkout_id and le.entry_type = 'earning'
    where rt.refund_id = p_refund_id
    order by le.organizer_id, le.currency
  loop
    perform pg_advisory_xact_lock(hashtextextended(rec.organizer_id::text || ':' || rec.currency, 0));
  end loop;

  insert into public.organizer_ledger_entry (
    organizer_id, event_id, ticket_checkout_id, transaction_id, entry_type,
    amount, currency, refund_id
  )
  select
    le.organizer_id,
    le.event_id,
    le.ticket_checkout_id,
    v_refund.transaction_id,
    'refund_hold',
    target.amount - coalesce(prior.net, 0),
    le.currency,
    p_refund_id
  from (
    select t.ticket_checkout_id, count(*) as units
    from public.ticket t
    where t.transaction_id = v_refund.transaction_id
      and t.ticket_checkout_id in (
        select t2.ticket_checkout_id
        from public.transaction_refund_ticket rt2
        join public.ticket t2 on t2.id = rt2.ticket_id
        where rt2.refund_id = p_refund_id
      )
      and exists (
        select 1
        from public.transaction_refund_ticket rt
        join public.transaction_refund r on r.id = rt.refund_id
        where rt.ticket_id = t.id and r.status <> 'failed'
      )
    group by t.ticket_checkout_id
  ) covered
  join public.ticket_checkout tc on tc.id = covered.ticket_checkout_id
  join public.organizer_ledger_entry le
    on le.ticket_checkout_id = tc.id and le.entry_type = 'earning'
  cross join lateral (
    select -1 * public.money_round(le.amount * covered.units / nullif(tc.quantity, 0), le.currency) as amount
  ) target
  left join lateral (
    select sum(x.amount) as net
    from public.organizer_ledger_entry x
    where x.transaction_id = v_refund.transaction_id
      and x.ticket_checkout_id = le.ticket_checkout_id
      and x.organizer_id = le.organizer_id
      and x.entry_type in ('refund_hold', 'refund_release')
  ) prior on true
  where target.amount - coalesce(prior.net, 0) < 0;
end;
$$;

-- A failed refund gives its hold back to the organizer.
create or replace function public._refund_release(p_refund_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
begin
  for rec in
    select distinct organizer_id, currency
    from public.organizer_ledger_entry
    where refund_id = p_refund_id
    order by organizer_id, currency
  loop
    perform pg_advisory_xact_lock(hashtextextended(rec.organizer_id::text || ':' || rec.currency, 0));
  end loop;

  insert into public.organizer_ledger_entry (
    organizer_id, event_id, ticket_checkout_id, transaction_id, entry_type,
    amount, currency, refund_id
  )
  select organizer_id, event_id, ticket_checkout_id, transaction_id,
         'refund_release', -1 * sum(amount), currency, p_refund_id
  from public.organizer_ledger_entry
  where refund_id = p_refund_id
    and entry_type in ('refund_hold', 'refund_release')
  group by organizer_id, event_id, ticket_checkout_id, transaction_id, currency
  having sum(amount) < 0;
end;
$$;

-- Audit row once the money is back: the ticket revenue returned, the
-- service fee kept.
create or replace function public._refund_fee_adjustment(p_refund_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.transaction_refund%rowtype;
  v_fee    public.platform_fee_entry%rowtype;
begin
  select * into v_refund from public.transaction_refund where id = p_refund_id;
  if not found or v_refund.amount <= 0 then
    return;
  end if;
  select * into v_fee
  from public.platform_fee_entry
  where transaction_id = v_refund.transaction_id and entry_type = 'fee';
  if not found then
    return;
  end if;

  insert into public.platform_fee_entry (
    transaction_id, event_id, entry_type,
    ticket_revenue, service_fee, total_customer_payment,
    processing_cost, net_revenue, fee_rate, currency, refund_id
  ) values (
    v_refund.transaction_id, v_fee.event_id, 'fee_refund_adjustment',
    -1 * v_refund.amount, 0, -1 * v_refund.amount,
    0, 0, v_fee.fee_rate, v_fee.currency, p_refund_id
  )
  on conflict (refund_id)
    where entry_type = 'fee_refund_adjustment' and refund_id is not null
    do nothing;
end;
$$;

create or replace function public.refund_mark_requested(
  p_refund_id          uuid,
  p_provider_refund_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.transaction_refund%rowtype;
begin
  select * into v_refund from public.transaction_refund where id = p_refund_id for update;
  if not found then
    raise exception 'Refund not found' using errcode = 'P0002';
  end if;
  -- The provider already refused it (its webhook can beat this call).
  if v_refund.status = 'failed' then
    return;
  end if;

  update public.transaction_refund
  set status = case when status = 'preparing' then 'requested' else status end,
      requested_at = coalesce(requested_at, now()),
      provider_refund_id = coalesce(provider_refund_id, p_provider_refund_id)
  where id = p_refund_id;

  perform public._refund_hold(p_refund_id);

  if v_refund.completes_payment then
    -- Already confirmed by an early webhook: straight to refunded.
    update public.transaction
    set status = case when v_refund.status = 'processed' then 'refunded' else 'refund_pending' end,
        refund_requested_at = coalesce(refund_requested_at, now()),
        updated_at = now()
    where id = v_refund.transaction_id and status = 'successful';
    if v_refund.status = 'processed' then
      update public.payment_attempt
      set status = 'refunded', updated_at = now()
      where transaction_id = v_refund.transaction_id and status = 'succeeded';
    end if;
  end if;
end;
$$;

create or replace function public.refund_mark_outcome(
  p_refund_id uuid,
  p_outcome   text,
  p_detail    text default null
)
returns table (
  refund_id         uuid,
  transaction_id    uuid,
  user_id           uuid,
  amount            numeric,
  currency          text,
  completes_payment boolean,
  changed           boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_refund  public.transaction_refund%rowtype;
  v_changed boolean := false;
begin
  if p_outcome not in ('processed', 'failed') then
    raise exception 'Unknown refund outcome' using errcode = '22023';
  end if;
  select * into v_refund from public.transaction_refund r where r.id = p_refund_id for update;
  if not found then
    raise exception 'Refund not found' using errcode = 'P0002';
  end if;

  -- Only an open refund changes: a redelivered or late answer is a no-op.
  if v_refund.status in ('preparing', 'requested') then
    v_changed := true;
    if p_outcome = 'processed' then
      update public.transaction_refund r
      set status = 'processed', processed_at = now()
      where r.id = p_refund_id;
      perform public._refund_fee_adjustment(p_refund_id);
      if v_refund.completes_payment then
        update public.transaction t
        set status = 'refunded', updated_at = now()
        where t.id = v_refund.transaction_id and t.status = 'refund_pending';
        if found then
          update public.payment_attempt pa
          set status = 'refunded', updated_at = now()
          where pa.transaction_id = v_refund.transaction_id and pa.status = 'succeeded';
        end if;
      end if;
    else
      update public.transaction_refund r
      set status = 'failed', failed_at = now(), failure_detail = p_detail
      where r.id = p_refund_id;
      perform public._refund_release(p_refund_id);
      if v_refund.completes_payment then
        update public.transaction t
        set status = 'successful', refund_claimed_at = null, updated_at = now()
        where t.id = v_refund.transaction_id and t.status = 'refund_pending';
      end if;
    end if;
  end if;

  return query
  select v_refund.id, v_refund.transaction_id, v_refund.user_id, v_refund.amount,
         v_refund.currency, v_refund.completes_payment, v_changed;
end;
$$;

-- Which refund a provider event is about: the provider's own id for it
-- (whatever its state, so a redelivery finds the refund it already
-- settled), else the oldest open refund of exactly that amount, else the
-- only open one. Null: not one of these refunds (the whole-payment path,
-- or a refund made outside Abonten).
create or replace function public.refund_match(
  p_transaction_id     uuid,
  p_provider_refund_id text,
  p_amount_minor       bigint
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_open integer;
begin
  if p_provider_refund_id is not null then
    select r.id into v_id
    from public.transaction_refund r
    where r.transaction_id = p_transaction_id
      and r.provider_refund_id = p_provider_refund_id
    limit 1;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if p_amount_minor is not null then
    select r.id into v_id
    from public.transaction_refund r
    where r.transaction_id = p_transaction_id
      and r.status in ('preparing', 'requested')
      and public.major_to_minor(r.amount, r.currency) = p_amount_minor
    order by r.created_at
    limit 1;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  select count(*), min(r.id::text)::uuid into v_open, v_id
  from public.transaction_refund r
  where r.transaction_id = p_transaction_id
    and r.status in ('preparing', 'requested');
  return case when v_open = 1 then v_id end;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public._refund_amount(uuid, uuid[])',
    'public._refund_hold(uuid)',
    'public._refund_release(uuid)',
    'public._refund_fee_adjustment(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', fn);
  end loop;
  foreach fn in array array[
    'public.refund_quote_amount(uuid, uuid[])',
    'public.refund_prepare(uuid)',
    'public.refund_mark_requested(uuid, text)',
    'public.refund_mark_outcome(uuid, text, text)',
    'public.refund_match(uuid, text, bigint)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
