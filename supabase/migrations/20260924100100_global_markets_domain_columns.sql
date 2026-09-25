-- Global platform, part 2: every domain row says which country, currency
-- and time zone it belongs to, and no function assumes Ghana any more.
--
-- Existing data is Ghanaian by construction (the product has only ever run
-- there), so the one-time backfill writes GH / Africa/Accra / GHS EXPLICITLY
-- from the default market row. After this migration nothing infers a
-- currency or country from a missing value: the columns are NOT NULL and
-- the services pass them.
--
-- Money columns stay numeric in major units (Postgres numeric is exact);
-- what changes is that each carries an explicit, validated currency.

-- ---------------------------------------------------------------------------
-- 1. Events, places, people
-- ---------------------------------------------------------------------------

alter table public.event
  add column country_code char(2),
  add column timezone     text,
  add column currency     char(3) references public.currency(code);

update public.event e
set country_code = public.default_market_country(),
    timezone     = public.market_timezone_for_country(public.default_market_country()),
    currency     = coalesce(
      (select upper(tt.currency) from public.ticket_type tt where tt.event_id = e.id and tt.currency is not null limit 1),
      public.default_market_currency()
    )
where e.country_code is null or e.timezone is null or e.currency is null;

alter table public.event
  alter column country_code set not null,
  alter column timezone set not null,
  alter column currency set not null,
  add constraint event_country_code_check check (country_code ~ '^[A-Z]{2}$');
create index event_country_code_idx on public.event (country_code);
comment on column public.event.timezone is 'IANA zone of the venue; starts_at/ends_at are instants, this is how they are shown.';
comment on column public.event.currency is 'Canonical currency of every ticket type on the event (enforced by trigger). What the customer is charged.';

alter table public.place
  add column country_code char(2),
  add column timezone     text;

update public.place
set country_code = public.default_market_country(),
    timezone     = public.market_timezone_for_country(public.default_market_country())
where country_code is null or timezone is null;

alter table public.place
  alter column country_code set not null,
  alter column timezone set not null,
  add constraint place_country_code_check check (country_code ~ '^[A-Z]{2}$');
create index place_country_code_idx on public.place (country_code);

alter table public.user_info
  add column country_code     char(2) check (country_code ~ '^[A-Z]{2}$'),
  add column display_currency char(3) references public.currency(code),
  add column locale           text,
  add column distance_unit    text check (distance_unit in ('km', 'mi'));
comment on column public.user_info.country_code is 'Home market. Set at sign-up from the phone country / request market; decides the credit currency.';

update public.user_info set country_code = public.default_market_country() where country_code is null;

-- Ticket types always carry their event's currency.
update public.ticket_type tt
set currency = e.currency
from public.event e
where e.id = tt.event_id and (tt.currency is null or upper(tt.currency) <> tt.currency);

alter table public.ticket_type
  alter column currency set not null,
  add constraint ticket_type_currency_fkey foreign key (currency) references public.currency(code);

create or replace function public.ticket_type_currency_matches_event()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_event_currency text;
begin
  select e.currency into v_event_currency from public.event e where e.id = new.event_id;
  if v_event_currency is null then
    return new;
  end if;
  if new.currency is null then
    new.currency := v_event_currency;
  elsif upper(new.currency) <> v_event_currency then
    raise exception 'Ticket currency % must match the event currency %', new.currency, v_event_currency
      using errcode = 'check_violation';
  end if;
  new.currency := upper(new.currency);
  return new;
end;
$$;
revoke all on function public.ticket_type_currency_matches_event() from public, anon, authenticated;
create trigger trg_ticket_type_currency
  before insert or update of currency, event_id on public.ticket_type
  for each row execute function public.ticket_type_currency_matches_event();

-- ---------------------------------------------------------------------------
-- 2. Money-path tables
-- ---------------------------------------------------------------------------

-- transaction: provider-neutral reference, explicit provider, settlement facts.
alter table public.transaction rename column paystack_reference to provider_reference;
alter table public.transaction drop constraint transaction_paystack_reference_key;
alter table public.transaction
  add column provider            text,
  add column provider_transaction_id text,
  add column settlement_currency char(3) references public.currency(code),
  add column settlement_amount   numeric(15,2),
  add column provider_fee        numeric(15,2),
  add column tax_amount          numeric(15,2) not null default 0 check (tax_amount >= 0),
  add column country_code        char(2) check (country_code ~ '^[A-Z]{2}$');

update public.transaction
set provider = case when payment_gateway_response ->> 'provider' = 'abonten_credit' then 'abonten_credit' else 'paystack' end,
    provider_transaction_id = nullif(payment_gateway_response ->> 'id', ''),
    settlement_currency = upper(currency),
    settlement_amount   = amount,
    country_code        = public.default_market_country(),
    currency            = upper(currency)
where provider is null;

alter table public.transaction
  alter column provider set not null,
  alter column currency drop default,
  add constraint transaction_provider_check check (provider in ('paystack', 'stripe', 'abonten_credit')),
  add constraint transaction_provider_reference_key unique (provider, provider_reference),
  add constraint transaction_currency_fkey foreign key (currency) references public.currency(code);
create index transaction_provider_transaction_id_idx on public.transaction (provider, provider_transaction_id) where provider_transaction_id is not null;
comment on column public.transaction.currency is 'Presentment currency: what the customer was charged in.';
comment on column public.transaction.provider_transaction_id is 'The provider''s own id for the charge (Paystack numeric id, Stripe payment_intent) — what refund and dispute webhooks reference.';
comment on column public.transaction.settlement_currency is 'Currency the provider settles this charge to Abonten in (from the market provider account).';
comment on column public.transaction.provider_fee is 'The provider''s own processing fee, in the presentment currency, when reported.';

-- Every accepted provider webhook delivery, so a redelivery of a settled
-- event is acknowledged without re-running it (finalizePayment's own lock
-- is the second line of defence).
create table public.payment_webhook_event (
  provider         text not null,
  country_code     char(2) not null,
  event_id         text not null,
  event_name       text not null,
  outcome          text not null check (outcome in ('settled', 'retry')),
  http_status      integer not null,
  attempts         integer not null default 1,
  first_received_at timestamptz not null default now(),
  last_received_at  timestamptz not null default now(),
  primary key (provider, country_code, event_id)
);
alter table public.payment_webhook_event enable row level security;
revoke all on table public.payment_webhook_event from anon, authenticated;
grant all on table public.payment_webhook_event to service_role;
create index payment_webhook_event_recent_idx on public.payment_webhook_event (last_received_at desc);

alter table public.payment_attempt
  alter column currency drop default,
  alter column provider drop default,
  add column country_code char(2) check (country_code ~ '^[A-Z]{2}$');
update public.payment_attempt set country_code = public.default_market_country(), currency = upper(currency) where country_code is null;
alter table public.payment_attempt
  add constraint payment_attempt_currency_fkey foreign key (currency) references public.currency(code);

alter table public.payout_account
  add column country_code  char(2) check (country_code ~ '^[A-Z]{2}$'),
  add column currency      char(3) references public.currency(code),
  add column provider_code text,
  add column details       jsonb not null default '{}'::jsonb;
update public.payout_account
set country_code = public.default_market_country(),
    currency     = public.default_market_currency()
where country_code is null;
alter table public.payout_account
  alter column country_code set not null,
  alter column currency set not null;
comment on column public.payout_account.details is 'Country-specific account fields (sort code, routing number, IBAN, BIC, branch code…) as the market''s payout method defines them.';

alter table public.payout
  add column provider     text,
  add column country_code char(2) check (country_code ~ '^[A-Z]{2}$');
update public.payout p
set provider     = 'paystack',
    country_code = coalesce((select pa.country_code from public.payout_account pa where pa.id = p.payout_account_id), public.default_market_country())
where provider is null;

alter table public.organizer_ledger_entry
  add constraint organizer_ledger_entry_currency_fkey foreign key (currency) references public.currency(code) not valid;
alter table public.organizer_ledger_entry validate constraint organizer_ledger_entry_currency_fkey;

alter table public.platform_fee_config add column country_code char(2) check (country_code ~ '^[A-Z]{2}$');
comment on column public.platform_fee_config.country_code is 'Optional per-market rate. Resolution: country+currency > country > currency > global.';

drop function if exists public.get_active_platform_fee_rate(text);
create or replace function public.get_active_platform_fee_rate(p_currency text default null, p_country_code text default null)
  returns numeric
  language sql
  stable
  set search_path = ''
as $$
  select c.fee_rate
  from public.platform_fee_config c
  where c.is_active
    and c.effective_from <= now()
    and (c.currency is null or c.currency = upper(p_currency))
    and (c.country_code is null or c.country_code = upper(p_country_code))
  order by (c.country_code is not null and c.country_code = upper(p_country_code)) desc,
           (c.currency is not null and c.currency = upper(p_currency)) desc,
           c.effective_from desc
  limit 1;
$$;
-- Same audience as before: the fee is public and signed-out checkout pages read it.
revoke all on function public.get_active_platform_fee_rate(text, text) from public;
grant execute on function public.get_active_platform_fee_rate(text, text) to anon, authenticated, service_role;

-- Promotion price lists are per market.
alter table public.event_promotion_tier add column country_code char(2) check (country_code ~ '^[A-Z]{2}$');
alter table public.place_promotion_tier add column country_code char(2) check (country_code ~ '^[A-Z]{2}$');
update public.event_promotion_tier set country_code = public.default_market_country() where country_code is null;
update public.place_promotion_tier set country_code = public.default_market_country() where country_code is null;
alter table public.event_promotion_tier alter column country_code set not null, alter column currency drop default;
alter table public.place_promotion_tier alter column country_code set not null, alter column currency drop default;
create index event_promotion_tier_country_idx on public.event_promotion_tier (country_code) where is_active;
create index place_promotion_tier_country_idx on public.place_promotion_tier (country_code) where is_active;

alter table public.content_promotion_pricing
  add column country_code char(2) check (country_code ~ '^[A-Z]{2}$'),
  alter column currency drop default;
update public.content_promotion_pricing set country_code = public.default_market_country() where country_code is null;
alter table public.content_promotion_pricing alter column country_code set not null;
create unique index content_promotion_pricing_country_key on public.content_promotion_pricing (country_code);

-- Subscriptions (dormant legacy feature): carry their currency too.
alter table public.subscription_checkout add column currency char(3) references public.currency(code);
update public.subscription_checkout set currency = public.default_market_currency() where currency is null;
alter table public.subscription_checkout alter column currency set not null;

-- ---------------------------------------------------------------------------
-- 3. Functions that read money-path rows
-- ---------------------------------------------------------------------------

drop function if exists public.cancel_event_and_release_tickets(uuid);
create function public.cancel_event_and_release_tickets(p_event_id uuid)
  returns table(refund_transaction_id uuid, attendee_user_id uuid, provider text, provider_reference text, transaction_amount numeric, transaction_currency character varying, event_title text)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_event_id uuid;
  v_event_title text;
  v_current_status text;
begin
  update public.event
     set status = 'canceled'
   where id = p_event_id
     and organizer_id = auth.uid()
     and status in ('draft', 'published')
  returning id, title into v_event_id, v_event_title;

  if v_event_id is null then
    select status into v_current_status
      from public.event
     where id = p_event_id and organizer_id = auth.uid();

    if v_current_status is null then
      raise exception 'Event not found or not owned by caller';
    elsif v_current_status = 'canceled' then
      raise exception 'Event is already cancelled';
    else
      raise exception 'Event cannot be cancelled from its current status';
    end if;
  end if;

  return query
  with cancelled_tickets as (
    update public.ticket t
       set status = 'cancelled', updated_at = now()
      from public.ticket_type tt
     where t.ticket_type_id = tt.id
       and tt.event_id = v_event_id
       and t.status in ('active', 'used')
    returning t.id as ticket_id, t.user_id, t.transaction_id
  ),
  cancel_attendance as (
    update public.attendance
       set status = 'cancelled'
     where event_id = v_event_id
       and status = 'attending'
    returning id
  ),
  cancel_checkouts as (
    update public.ticket_checkout
       set status = 'cancelled', updated_at = now()
     where event_id = v_event_id
       and status = 'paid'
    returning id
  ),
  refundable as (
    select
      ct.user_id,
      ct.transaction_id,
      tr.amount,
      coalesce(tr.amount, 0) + coalesce(tr.credit_amount, 0) as paid_total,
      tr.currency,
      tr.provider,
      tr.provider_reference
    from cancelled_tickets ct
    left join public.transaction tr on tr.id = ct.transaction_id
  ),
  notify as (
    insert into public.notification (user_id, type, title, body, link)
    select distinct on (r.user_id)
      r.user_id,
      'event_cancelled',
      'Event cancelled',
      case
        when r.paid_total > 0 then format(
          'The organizer has cancelled %s. Your ticket is no longer valid. A refund will be issued to the payment method used for your ticket.',
          v_event_title
        )
        else format(
          'The organizer has cancelled %s. Your registration has been cancelled.',
          v_event_title
        )
      end,
      case when r.paid_total > 0 then '/manage/my-events?tab=refunds' else '/manage/my-events?tab=cancelled' end
    from refundable r
    order by r.user_id, (r.paid_total > 0) desc nulls last
    returning id
  )
  select distinct
    r.transaction_id, r.user_id, r.provider, r.provider_reference, r.paid_total, r.currency, v_event_title
    from refundable r
   where r.transaction_id is not null and r.paid_total > 0;
end;
$$;
revoke all on function public.cancel_event_and_release_tickets(uuid) from public, anon;
grant execute on function public.cancel_event_and_release_tickets(uuid) to authenticated, service_role;

drop function if exists public.record_payment_dispute(text, text, text, text, text, bigint, text, jsonb);
create or replace function public.record_payment_dispute(
  p_provider_dispute_id text,
  p_provider_reference text,
  p_event text,
  p_status text,
  p_resolution text,
  p_amount_minor bigint,
  p_currency text,
  p_raw jsonb,
  p_provider text default 'paystack'
)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_transaction_id uuid;
  v_id             uuid;
  v_is_new         boolean;
  v_resolved       boolean := p_event in ('charge.dispute.resolve', 'charge.dispute.closed');
  v_minor_units    smallint;
begin
  if coalesce(length(p_provider_dispute_id), 0) = 0 then
    raise exception 'Dispute id is required' using errcode = '22023';
  end if;

  if p_provider_reference is not null then
    select t.id into v_transaction_id
    from public.transaction t
    where t.provider = p_provider and t.provider_reference = p_provider_reference;
  end if;

  select c.minor_units into v_minor_units from public.currency c where c.code = upper(p_currency);

  insert into public.payment_dispute (
    provider, provider_dispute_id, transaction_id, provider_reference, status,
    resolution, amount, currency, last_event, raw, resolved_at
  ) values (
    p_provider, p_provider_dispute_id, v_transaction_id, p_provider_reference,
    coalesce(p_status, 'unknown'), p_resolution,
    case when p_amount_minor is null then null
         else round(p_amount_minor / power(10, coalesce(v_minor_units, 2))::numeric, coalesce(v_minor_units, 2)) end,
    upper(p_currency), p_event, coalesce(p_raw, '{}'::jsonb),
    case when v_resolved then now() end
  )
  on conflict (provider, provider_dispute_id) do update
    set transaction_id     = coalesce(public.payment_dispute.transaction_id, excluded.transaction_id),
        provider_reference = coalesce(excluded.provider_reference, public.payment_dispute.provider_reference),
        status             = excluded.status,
        resolution         = coalesce(excluded.resolution, public.payment_dispute.resolution),
        amount             = coalesce(excluded.amount, public.payment_dispute.amount),
        currency           = coalesce(excluded.currency, public.payment_dispute.currency),
        last_event         = excluded.last_event,
        raw                = excluded.raw,
        resolved_at        = case when v_resolved
                                  then coalesce(public.payment_dispute.resolved_at, now())
                                  else public.payment_dispute.resolved_at end,
        updated_at         = now()
  returning id, (xmax = 0) into v_id, v_is_new;

  if v_is_new and not v_resolved then
    perform public.open_reconciliation_incident(
      'payments.dispute:' || v_id,
      initcap(p_provider) || ' dispute opened',
      format('Dispute %s on reference %s (transaction %s), status %s. Respond in the %s dashboard before the deadline, and check any referral rewards linked to this sale.',
             p_provider_dispute_id, coalesce(p_provider_reference, 'unknown'),
             coalesce(v_transaction_id::text, 'not found'), coalesce(p_status, 'unknown'), initcap(p_provider)),
      'high'
    );
  end if;

  return v_id;
end;
$$;
revoke all on function public.record_payment_dispute(text, text, text, text, text, bigint, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_payment_dispute(text, text, text, text, text, bigint, text, jsonb, text) to service_role;

-- Buyer history and summary: currency always from the row.
create or replace function public.get_user_transaction_history(p_start timestamp with time zone, p_end timestamp with time zone, p_cursor_created_at timestamp with time zone, p_cursor_id uuid, p_limit integer)
  returns table(id uuid, kind text, status text, created_at timestamp with time zone, completed_at timestamp with time zone, amount numeric, currency text, title text, subtitle text, quantity integer, reference uuid, cancelled_quantity integer, refund_status text, refund_requested_at timestamp with time zone, service_fee numeric, total_paid numeric, credit_used numeric)
  language plpgsql
  set search_path = ''
as $$
begin
  return query
  with raw as (
    select
      tc.id,
      'ticket'::text as kind,
      tc.status,
      (tc.created_at at time zone 'UTC') as created_at,
      tc.completed_at,
      tc.total_price as amount,
      tt.currency::text as currency,
      e.title,
      tt.type as subtitle,
      tc.quantity,
      coalesce(tc.checkout_session_id, tc.id) as reference,
      tix.cancelled_quantity,
      tix.refund_status,
      tix.refund_requested_at,
      tix.txn_id,
      tix.txn_amount,
      tix.txn_credit
    from public.ticket_checkout tc
    left join public.ticket_type tt on tt.id = tc.ticket_type_id
    left join public.event e on e.id = tc.event_id
    left join lateral (
      select
        count(*) filter (where t.status = 'cancelled')::integer as cancelled_quantity,
        (array_agg(tr.status order by t.updated_at desc nulls last) filter (where t.status = 'cancelled'))[1] as refund_status,
        (array_agg(tr.refund_requested_at order by t.updated_at desc nulls last) filter (where t.status = 'cancelled'))[1] as refund_requested_at,
        (array_agg(t.transaction_id) filter (where t.transaction_id is not null))[1] as txn_id,
        max(tr.amount + coalesce(tr.credit_amount, 0)) as txn_amount,
        max(coalesce(tr.credit_amount, 0)) as txn_credit
      from public.ticket t
      left join public.transaction tr on tr.id = t.transaction_id
      where t.ticket_checkout_id = tc.id
    ) tix on true
    where tc.user_id = auth.uid()
      and (p_start is null or (tc.created_at at time zone 'UTC') >= p_start)
      and (p_end   is null or (tc.created_at at time zone 'UTC') <= p_end)

    union all

    select
      sc.id,
      'subscription'::text,
      sc.status,
      sc.created_at,
      sc.completed_at,
      sc.total_price,
      sc.currency::text,
      sc.subscription_plan_name,
      'Subscription'::text,
      null::integer,
      sc.id,
      null::integer,
      null::text,
      null::timestamptz,
      null::uuid,
      null::numeric,
      null::numeric
    from public.subscription_checkout sc
    where sc.user_id = auth.uid()
      and (p_start is null or sc.created_at >= p_start)
      and (p_end   is null or sc.created_at <= p_end)
  ),
  shared as (
    select
      r.*,
      r.amount / nullif((
        select sum(tc2.total_price)
        from public.ticket_checkout tc2
        where tc2.id in (
          select distinct t2.ticket_checkout_id
          from public.ticket t2
          where t2.transaction_id = r.txn_id
            and t2.ticket_checkout_id is not null
        )
      ), 0) as share
    from raw r
  ),
  priced as (
    select
      s.*,
      case
        when s.txn_id is null or s.txn_amount is null then 0::numeric
        else greatest(round(s.txn_amount * s.share - s.amount, 2), 0::numeric)
      end as service_fee,
      case
        when s.txn_id is null or coalesce(s.txn_credit, 0) = 0 then 0::numeric
        else round(s.txn_credit * coalesce(s.share, 0), 2)
      end as credit_used
    from shared s
  )
  select
    u.id, u.kind, u.status, u.created_at, u.completed_at, u.amount, u.currency,
    u.title, u.subtitle, u.quantity, u.reference, u.cancelled_quantity,
    u.refund_status, u.refund_requested_at,
    u.service_fee,
    u.amount + u.service_fee as total_paid,
    u.credit_used
  from priced u
  where p_cursor_created_at is null
     or u.created_at < p_cursor_created_at
     or (u.created_at = p_cursor_created_at and u.id < p_cursor_id)
  order by u.created_at desc, u.id desc
  limit p_limit;
end;
$$;

create or replace function public.get_user_transaction_summary(p_start timestamp with time zone, p_end timestamp with time zone)
  returns table(currency text, amount_spent numeric, total_transactions bigint, successful_count bigint, pending_count bigint, failed_count bigint, tickets_purchased bigint, subscriptions_count bigint)
  language plpgsql
  set search_path = ''
as $$
begin
  return query
  with my_tc as (
    select tc.*
    from public.ticket_checkout tc
    where tc.user_id = auth.uid()
      and (p_start is null or (tc.created_at at time zone 'UTC') >= p_start)
      and (p_end   is null or (tc.created_at at time zone 'UTC') <= p_end)
  ),
  my_sc as (
    select sc.*
    from public.subscription_checkout sc
    where sc.user_id = auth.uid()
      and (p_start is null or sc.created_at >= p_start)
      and (p_end   is null or sc.created_at <= p_end)
  ),
  counts as (
    select
      (select count(*) from my_tc) + (select count(*) from my_sc) as total_transactions,
      (select count(*) from my_tc where status = 'paid')
        + (select count(*) from my_sc where status = 'paid')      as successful_count,
      (select count(*) from my_tc where status = 'pending')
        + (select count(*) from my_sc where status = 'pending')   as pending_count,
      (select count(*) from my_tc where status = 'failed')
        + (select count(*) from my_sc where status = 'failed')    as failed_count,
      (select coalesce(sum(quantity), 0) from my_tc where status = 'paid') as tickets_purchased,
      (select count(*) from my_sc where status = 'paid')          as subscriptions_count
  ),
  money_by_currency as (
    select
      tt.currency::text as currency,
      sum(
        mtc.total_price
        + case
            when txn.id is null or txn.amount is null then 0::numeric
            else greatest(
              round(
                txn.amount
                  * (mtc.total_price / nullif((
                      select sum(tc2.total_price)
                      from public.ticket_checkout tc2
                      where tc2.id in (
                        select distinct t2.ticket_checkout_id
                        from public.ticket t2
                        where t2.transaction_id = txn.id
                          and t2.ticket_checkout_id is not null
                      )
                    ), 0))
                  - mtc.total_price,
                2),
              0::numeric
            )
          end
      ) as spent
    from my_tc mtc
    join public.ticket_type tt on tt.id = mtc.ticket_type_id
    left join lateral (
      select tr.id, tr.amount
      from public.ticket t
      join public.transaction tr on tr.id = t.transaction_id
      where t.ticket_checkout_id = mtc.id
      limit 1
    ) txn on true
    where mtc.status = 'paid'
    group by tt.currency

    union all

    select msc.currency::text, coalesce(sum(msc.total_price), 0)
    from my_sc msc
    where msc.status = 'paid'
    group by msc.currency
  ),
  money_rows as (
    select money_by_currency.currency, sum(money_by_currency.spent) as amount_spent
    from money_by_currency
    group by money_by_currency.currency
  )
  select mr.currency, mr.amount_spent, c.total_transactions, c.successful_count,
         c.pending_count, c.failed_count, c.tickets_purchased, c.subscriptions_count
  from money_rows mr
  cross join counts c;
end;
$$;

-- Mechanical, auditable rewrites of the remaining "'GHS'" fallbacks:
--   * COALESCE(tt.currency, 'GHS')            -> tt.currency        (column is NOT NULL now)
--   * coalesce((select currency from platform_fee_config …), 'GHS')
--                                             -> public.default_market_currency()
do $$
declare
  r record;
  v_def text;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('get_organizer_dashboard_overview', 'admin_dashboard_kpis', 'admin_finance_overview', 'admin_platform_analytics', 'record_organizer_earning', 'record_platform_fee')
  loop
    v_def := pg_get_functiondef(r.oid);
    v_def := replace(v_def, 'COALESCE(tt.currency, ''GHS'')', 'tt.currency');
    v_def := regexp_replace(
      v_def,
      'coalesce\(\s*\(select currency from public\.platform_fee_config where is_active limit 1\),\s*''GHS''\s*\)',
      'public.default_market_currency()',
      'g'
    );
    if position('''GHS''' in v_def) > 0 then
      raise exception 'Function % still references GHS after rewrite', r.proname;
    end if;
    execute v_def;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Credit ledger: one account per person in their home market's currency,
--    system ledgers per currency, reward rules per currency.
-- ---------------------------------------------------------------------------

alter table public.credit_account drop constraint credit_account_currency_check;
create unique index credit_account_one_per_user on public.credit_account (user_id);
alter table public.credit_account add constraint credit_account_currency_fkey foreign key (currency) references public.currency(code);
alter table public.credit_account alter column currency drop default;
alter table public.credit_ledger_account alter column currency drop default;
alter table public.credit_journal alter column currency drop default;
alter table public.credit_lot alter column currency drop default;
alter table public.credit_reservation alter column currency drop default;
alter table public.credit_entry alter column currency drop default;

create or replace function public._credit_home_currency(p_user_id uuid)
  returns text
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(
    (select a.currency::text from public.credit_account a where a.user_id = p_user_id limit 1),
    public.market_currency_for_country((select u.country_code from public.user_info u where u.id = p_user_id)),
    public.default_market_currency()
  );
$$;
revoke all on function public._credit_home_currency(uuid) from public, anon, authenticated;

create or replace function public._credit_ensure_account(p_user_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_currency text := public._credit_home_currency(p_user_id);
begin
  insert into public.credit_account (user_id, currency)
  values (p_user_id, v_currency)
  on conflict do nothing;

  insert into public.credit_ledger_account (owner_user_id, code, currency)
  select p_user_id, c, v_currency
  from unnest(array['pending', 'available', 'reserved', 'frozen', 'withdrawing']) as c
  where not exists (
    select 1 from public.credit_ledger_account l
    where l.owner_user_id = p_user_id and l.code = c
  );
end;
$$;

create or replace function public._credit_user_ledger_id(p_user_id uuid, p_code text)
  returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select id from public.credit_ledger_account
  where owner_user_id = p_user_id and code = p_code
  limit 1;
$$;

-- System ledgers are per currency and created on first use. The one-argument
-- form is replaced (the default keeps every existing one-argument call valid).
drop function if exists public._credit_system_ledger_id(text);
create or replace function public._credit_system_ledger_id(p_code text, p_currency text default null)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_currency text := coalesce(upper(p_currency), public.default_market_currency());
  v_id uuid;
begin
  select id into v_id from public.credit_ledger_account
  where owner_user_id is null and code = p_code and currency = v_currency;
  if v_id is null then
    insert into public.credit_ledger_account (owner_user_id, code, currency)
    values (null, p_code, v_currency)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public._credit_system_ledger_id(text, text) from public, anon, authenticated;

-- Every entry is written in the journal's currency; a system ledger passed
-- for another currency is swapped for the same account in the right one, so
-- callers that only name a system account by code stay correct.
create or replace function public._credit_entry(p_journal_id uuid, p_ledger_id uuid, p_lot_id uuid, p_amount_minor bigint)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_ledger   public.credit_ledger_account;
  v_currency text;
  v_ledger_id uuid := p_ledger_id;
begin
  if p_ledger_id is null then
    raise exception 'credit ledger account missing for journal %', p_journal_id;
  end if;
  if p_amount_minor = 0 then
    return;
  end if;

  select * into v_ledger from public.credit_ledger_account where id = p_ledger_id;

  select coalesce(a.currency::text, v_ledger.currency::text) into v_currency
  from public.credit_journal j
  left join public.credit_account a on a.user_id = j.user_id
  where j.id = p_journal_id;

  if v_ledger.owner_user_id is null and v_ledger.currency <> v_currency then
    v_ledger_id := public._credit_system_ledger_id(v_ledger.code, v_currency);
  end if;

  insert into public.credit_entry (journal_id, ledger_account_id, lot_id, amount_minor, currency)
  values (p_journal_id, v_ledger_id, p_lot_id, p_amount_minor, v_currency);
end;
$$;

-- Rows written by the credit functions take the account's currency.
create or replace function public.credit_set_row_currency()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.user_id is not null then
    new.currency := coalesce(
      (select a.currency from public.credit_account a where a.user_id = new.user_id),
      public._credit_home_currency(new.user_id)
    );
  elsif new.currency is null then
    new.currency := public.default_market_currency();
  end if;
  return new;
end;
$$;
revoke all on function public.credit_set_row_currency() from public, anon, authenticated;
create trigger credit_journal_currency before insert on public.credit_journal
  for each row execute function public.credit_set_row_currency();
create trigger credit_lot_currency before insert on public.credit_lot
  for each row execute function public.credit_set_row_currency();
create trigger credit_reservation_currency before insert on public.credit_reservation
  for each row execute function public.credit_set_row_currency();

-- The account predicate "and a.currency = 'GHS'" is redundant now that a
-- person has exactly one account (credit_account_one_per_user); strip it
-- from every credit function rather than re-typing each body.
do $$
declare
  r record;
  v_def text;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'credit\_%' escape '\' or (n.nspname = 'public' and p.proname = '_credit_expire_lot')
  loop
    v_def := pg_get_functiondef(r.oid);
    if position('a.currency = ''GHS''' in v_def) = 0 then
      continue;
    end if;
    v_def := regexp_replace(v_def, '\s+and a\.currency = ''GHS''', '', 'g');
    if position('''GHS''' in v_def) > 0 then
      raise exception 'Function % still references GHS after rewrite', r.proname;
    end if;
    execute v_def;
  end loop;
end
$$;

create or replace function public.get_my_credit_summary()
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_acct public.credit_account;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_acct from public.credit_account a
  where a.user_id = v_uid;

  return jsonb_build_object(
    'currency', coalesce(v_acct.currency::text, public._credit_home_currency(v_uid)),
    'status', coalesce(v_acct.status, 'active'),
    'available_minor', coalesce(v_acct.available_minor, 0),
    'pending_minor', coalesce(v_acct.pending_minor, 0),
    'on_hold_minor', coalesce(v_acct.reserved_minor + v_acct.frozen_minor + v_acct.withdrawing_minor, 0),
    'in_debt', coalesce(v_acct.available_minor, 0) < 0,
    'lifetime', jsonb_build_object(
      'earned_minor', coalesce(v_acct.lifetime_earned_minor, 0),
      'spent_minor', coalesce(v_acct.lifetime_spent_minor, 0),
      'withdrawn_minor', coalesce(v_acct.lifetime_withdrawn_minor, 0),
      'expired_minor', coalesce(v_acct.lifetime_expired_minor, 0),
      'reversed_minor', coalesce(v_acct.lifetime_reversed_minor, 0)
    ),
    'by_scope', coalesce((
      select jsonb_object_agg(s.spend_scope, s.free_minor)
      from (
        select l.spend_scope, sum(l.remaining_minor - l.held_minor) as free_minor
        from public.credit_lot l
        where l.user_id = v_uid and l.status = 'active' and l.remaining_minor > l.held_minor
        group by l.spend_scope
      ) s
    ), '{}'::jsonb),
    'withdrawable_minor', coalesce((
      select sum(l.remaining_minor - l.held_minor)
      from public.credit_lot l
      where l.user_id = v_uid and l.status = 'active' and l.withdrawable
        and (l.withdrawable_at is null or l.withdrawable_at <= now())
    ), 0),
    'expiring_soon', (
      select case when count(*) = 0 then null else jsonb_build_object(
        'amount_minor', sum(l.remaining_minor - l.held_minor),
        'expires_at', min(l.expires_at)
      ) end
      from public.credit_lot l
      where l.user_id = v_uid and l.status = 'active'
        and l.remaining_minor > l.held_minor
        and l.expires_at <= now() + interval '14 days'
    ),
    'next_release', (
      select jsonb_build_object(
        'amount_minor', l.remaining_minor,
        'release_at', l.release_at,
        'label', l.label
      )
      from public.credit_lot l
      where l.user_id = v_uid and l.status = 'pending' and l.release_at is not null
      order by l.release_at asc
      limit 1
    )
  );
end;
$$;

-- Reward rules pay in one currency; an order in another currency is not
-- eligible for that rule (a market gets its own rule versions).
alter table public.reward_rule add column currency char(3) references public.currency(code);
-- Rule versions are immutable by trigger; this one-time backfill labels the
-- existing (Ghana) versions with the currency they were always paid in.
alter table public.reward_rule disable trigger reward_rule_immutable;
update public.reward_rule set currency = public.default_market_currency() where currency is null;
alter table public.reward_rule enable trigger reward_rule_immutable;
-- New versions created without a currency belong to the default market;
-- Admin › Rewards passes one explicitly for every other market.
alter table public.reward_rule alter column currency set not null,
  alter column currency set default public.default_market_currency();
alter table public.reward_event alter column currency drop default;

create or replace function public.reward_event_set_currency()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.currency := coalesce(
    (select r.currency from public.reward_rule r where r.id = new.rule_id),
    new.currency,
    public.default_market_currency()
  );
  return new;
end;
$$;
revoke all on function public.reward_event_set_currency() from public, anon, authenticated;
create trigger reward_event_currency before insert on public.reward_event
  for each row execute function public.reward_event_set_currency();

do $$
declare
  v_oid oid;
  v_def text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = '_reward_evaluate_promoter_commission';
  v_def := pg_get_functiondef(v_oid);
  v_def := replace(v_def, 'v_currency <> ''GHS''', 'v_currency <> v_rule.currency');
  if position('''GHS''' in v_def) > 0 then
    raise exception '_reward_evaluate_promoter_commission still references GHS after rewrite';
  end if;
  execute v_def;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Creating events and places: country, time zone and currency are inputs
-- ---------------------------------------------------------------------------

drop function if exists public.create_event(uuid, uuid, text, text, text, text, text, text[], double precision, double precision, jsonb, integer, text, text, text, timestamp with time zone, timestamp with time zone, boolean, boolean, jsonb, jsonb, jsonb, jsonb, uuid);
create function public.create_event(
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

  -- Country from the caller, else the structured address, else the default
  -- market. Time zone and currency default to the market's own.
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
    insert into ticket_type (event_id, type, price, currency, quantity, available_from, available_until)
    select
      v_event_id,
      elem->>'type',
      (elem->>'price')::numeric,
      v_currency,
      (elem->>'quantity')::integer,
      (elem->>'available_from')::timestamp,
      (elem->>'available_until')::timestamp
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

drop function if exists public.create_place(uuid, uuid, text, text, text, smallint, double precision, double precision, jsonb, text, text, text, jsonb, text, text, jsonb, jsonb);
create function public.create_place(
  p_client_request_id uuid, p_owner_id uuid, p_name text, p_slug text, p_description text,
  p_category_id smallint, p_latitude double precision, p_longitude double precision,
  p_address jsonb, p_website_url text, p_phone text, p_whatsapp text, p_social_links jsonb,
  p_cover_public_id text, p_cover_version text, p_opening_hours jsonb, p_services jsonb,
  p_country_code text default null,
  p_timezone text default null
)
  returns uuid
  language plpgsql
  set search_path to 'public', 'extensions'
as $function$
declare
  v_place_id uuid;
  v_country  text;
  v_timezone text;
begin
  select id into v_place_id from place where client_request_id = p_client_request_id;
  if v_place_id is not null then
    return v_place_id;
  end if;

  v_country := upper(coalesce(p_country_code, p_address ->> 'country_code', public.default_market_country()));
  v_timezone := coalesce(p_timezone, public.market_timezone_for_country(v_country));

  insert into place (
    client_request_id, owner_id, name, slug, description, category_id,
    location, address, website_url, phone, whatsapp, social_links,
    cover_public_id, cover_version, status, created_at, updated_at,
    country_code, timezone
  )
  values (
    p_client_request_id, p_owner_id, p_name, p_slug, p_description, p_category_id,
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::extensions.geography,
    p_address, p_website_url, p_phone, p_whatsapp, p_social_links,
    p_cover_public_id, p_cover_version, 'published', now(), now(),
    v_country, v_timezone
  )
  on conflict (client_request_id) do nothing
  returning id into v_place_id;

  if v_place_id is null then
    select id into v_place_id from place where client_request_id = p_client_request_id;
    return v_place_id;
  end if;

  if p_opening_hours is not null and jsonb_array_length(p_opening_hours) > 0 then
    insert into place_opening_hours (place_id, day_of_week, open_time, close_time, is_closed)
    select
      v_place_id,
      (elem->>'day_of_week')::smallint,
      nullif(elem->>'open_time', '')::time,
      nullif(elem->>'close_time', '')::time,
      coalesce((elem->>'is_closed')::boolean, false)
    from jsonb_array_elements(p_opening_hours) elem;
  end if;

  if p_services is not null and jsonb_array_length(p_services) > 0 then
    insert into place_service (place_id, name, description, price, price_unit, show_price, position)
    select
      v_place_id,
      elem->>'name',
      elem->>'description',
      nullif(elem->>'price', '')::numeric,
      elem->>'price_unit',
      coalesce((elem->>'show_price')::boolean, true),
      ord - 1
    from jsonb_array_elements(p_services) with ordinality as t(elem, ord);
  end if;

  return v_place_id;
end;
$function$;

-- The market helpers are read inside SECURITY INVOKER functions called by
-- signed-in people (create_event, create_place, ticket_type trigger), so
-- authenticated may execute them; the market table itself stays private.
grant execute on function public.create_event(uuid, uuid, text, text, text, text, text, text[], double precision, double precision, jsonb, integer, text, text, text, timestamp with time zone, timestamp with time zone, boolean, boolean, jsonb, jsonb, jsonb, jsonb, uuid, text, text, text) to anon, authenticated, service_role;
grant execute on function public.create_place(uuid, uuid, text, text, text, smallint, double precision, double precision, jsonb, text, text, text, jsonb, text, text, jsonb, jsonb, text, text) to anon, authenticated, service_role;
grant execute on function public.default_market_currency() to authenticated;
grant execute on function public.default_market_country() to authenticated;
grant execute on function public.market_currency_for_country(text) to authenticated;
grant execute on function public.market_timezone_for_country(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Sanity: nothing in public functions still says 'GHS'.
-- ---------------------------------------------------------------------------

do $$
declare
  v_names text;
begin
  select string_agg(p.proname, ', ') into v_names
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and pg_get_functiondef(p.oid) like '%''GHS''%';
  if v_names is not null then
    raise exception 'Functions still hard-code GHS: %', v_names;
  end if;
end
$$;
