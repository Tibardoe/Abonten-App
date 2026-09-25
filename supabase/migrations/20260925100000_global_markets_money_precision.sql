-- Global markets, part 10: every stored amount keeps its currency's own
-- precision.
--
-- Found in the hardening audit: money columns were numeric(x,2) and several
-- ledger functions converted minor units with a fixed `/ 100.0` or rounded
-- with a fixed `round(x, 2)`. That is right for cedis, naira, pounds and
-- euros, and wrong for currencies with another number of decimals:
--   * XOF (Côte d'Ivoire, a Paystack market) and JPY have none: a promoter
--     commission of 500 francs was booked as 5.00, a credit refund of
--     1,000 francs recorded as 10.00;
--   * KWD, BHD, OMR, JOD and TND have three: the third decimal was lost on
--     every write.
--
-- 1. currency_minor_units / money_round / minor_to_major / major_to_minor
--    read the ISO 4217 exponent from public.currency; an unknown code is an
--    error, never a silent 2.
-- 2. Money columns widen to scale 3 (precision +2, so high-denomination
--    currencies such as VND, IDR or UGX have headroom). Existing values are
--    unchanged: 12.50 stays 12.500. No view or policy depends on them.
-- 3. The ledger, refund, credit and reporting functions round with the
--    row's currency instead of a fixed 2.
-- 4. A market may only use currencies Abonten can store and charge (at most
--    three decimals).
--
-- The unused `wallet` table (0 partitions, no code reads it) keeps its type.

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------

create or replace function public.currency_minor_units(p_currency text)
  returns integer
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v integer;
begin
  select c.minor_units into v from public.currency c where c.code = upper(btrim(p_currency));
  if v is null then
    raise exception 'Unknown currency %', p_currency using errcode = '22023';
  end if;
  return v;
end;
$$;

create or replace function public.money_round(p_amount numeric, p_currency text)
  returns numeric
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select round(p_amount, public.currency_minor_units(p_currency));
$$;

create or replace function public.minor_to_major(p_minor numeric, p_currency text)
  returns numeric
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select round(p_minor / power(10::numeric, public.currency_minor_units(p_currency)),
               public.currency_minor_units(p_currency));
$$;

create or replace function public.major_to_minor(p_amount numeric, p_currency text)
  returns bigint
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select round(p_amount * power(10::numeric, public.currency_minor_units(p_currency)))::bigint;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.currency_minor_units(text)',
    'public.money_round(numeric, text)',
    'public.minor_to_major(numeric, text)',
    'public.major_to_minor(numeric, text)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Storage precision
-- ---------------------------------------------------------------------------

alter table public.transaction
  alter column amount                 type numeric(17,3),
  alter column credit_amount          type numeric(14,3),
  alter column credit_refunded_amount type numeric(14,3),
  alter column provider_fee           type numeric(17,3),
  alter column settlement_amount      type numeric(17,3),
  alter column tax_amount             type numeric(17,3);

alter table public.payment_attempt
  alter column amount        type numeric(17,3),
  alter column credit_amount type numeric(14,3);

alter table public.ticket_checkout
  alter column unit_price  type numeric(13,3),
  alter column total_price type numeric(13,3),
  alter column discount    type numeric(13,3);

alter table public.organizer_ledger_entry
  alter column amount       type numeric(14,3),
  alter column gross_amount type numeric(14,3),
  alter column fee_amount   type numeric(14,3);

alter table public.platform_fee_entry
  alter column ticket_revenue         type numeric(14,3),
  alter column service_fee            type numeric(14,3),
  alter column total_customer_payment type numeric(14,3),
  alter column processing_cost        type numeric(14,3),
  alter column net_revenue            type numeric(14,3),
  alter column credit_applied         type numeric(14,3);

alter table public.payout          alter column amount type numeric(14,3);
alter table public.payment_dispute alter column amount type numeric(14,3);

alter table public.subscription_checkout
  alter column unit_price  type numeric(13,3),
  alter column total_price type numeric(13,3),
  alter column discount    type numeric(13,3);
alter table public.subscription_plan alter column price type numeric(11,3);

-- ---------------------------------------------------------------------------
-- 3. Markets use storable currencies only
-- ---------------------------------------------------------------------------

create or replace function public.guard_market_currencies()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_code  text;
  v_units integer;
begin
  foreach v_code in array (new.supported_currencies::text[] || array[new.default_currency::text]) loop
    select c.minor_units into v_units from public.currency c where c.code = upper(v_code);
    if v_units is null then
      raise exception 'Unknown currency % for market %', v_code, new.country_code using errcode = '22023';
    end if;
    if v_units > 3 then
      raise exception 'Currency % has % decimal places; Abonten stores and charges at most 3', v_code, v_units
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.guard_market_currencies() from public, anon, authenticated;

drop trigger if exists market_currencies_guard on public.market;
create trigger market_currencies_guard
  before insert or update of default_currency, supported_currencies on public.market
  for each row execute function public.guard_market_currencies();

-- ---------------------------------------------------------------------------
-- 4. Currency-aware ledger, refund, credit and reporting functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_platform_fee(p_transaction_id uuid, p_processing_cost numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_ticket_revenue  numeric;
  v_currency        text;
  v_country         text;
  v_distinct_events integer;
  v_event_id        uuid;
  v_fee_rate        numeric(6,4);
  v_market_bps      numeric;
  v_txn_amount      numeric;
  v_credit          numeric;
  v_service_fee     numeric;
BEGIN
  SELECT
    COALESCE(SUM(x.total_price), 0),
    MIN(x.currency),
    COUNT(DISTINCT x.event_id),
    (array_agg(x.event_id))[1]
  INTO v_ticket_revenue, v_currency, v_distinct_events, v_event_id
  FROM (
    SELECT DISTINCT tc.id, tc.total_price, tc.event_id, tt.currency::text AS currency
    FROM public.ticket t
    JOIN public.ticket_checkout tc ON tc.id = t.ticket_checkout_id
    JOIN public.ticket_type tt ON tt.id = tc.ticket_type_id
    WHERE t.transaction_id = p_transaction_id
      AND t.ticket_checkout_id IS NOT NULL
  ) x;

  IF v_ticket_revenue IS NULL OR v_ticket_revenue <= 0 THEN
    RETURN;
  END IF;

  -- What the customer paid in total: the cash the provider collected plus
  -- any Abonten Credit (transaction.amount is cash only).
  SELECT amount, COALESCE(credit_amount, 0), country_code::text
    INTO v_txn_amount, v_credit, v_country
  FROM public.transaction
  WHERE id = p_transaction_id;

  -- Same precedence as the checkout: the market's own service fee, else the
  -- platform rate for this currency and country.
  SELECT (m.fee_config ->> 'serviceFeeBps')::numeric INTO v_market_bps
  FROM public.market m WHERE m.country_code = v_country;
  v_fee_rate := COALESCE(v_market_bps / 10000,
                         public.get_active_platform_fee_rate(v_currency, v_country), 0);

  v_service_fee := public.money_round(COALESCE(v_txn_amount + v_credit, v_ticket_revenue) - v_ticket_revenue, v_currency);
  IF v_service_fee < 0 THEN
    v_service_fee := public.money_round(v_ticket_revenue * v_fee_rate, v_currency);
  END IF;

  INSERT INTO public.platform_fee_entry (
    transaction_id, event_id, entry_type,
    ticket_revenue, service_fee, total_customer_payment,
    processing_cost, net_revenue, fee_rate, currency, credit_applied
  ) VALUES (
    p_transaction_id,
    CASE WHEN v_distinct_events = 1 THEN v_event_id ELSE NULL END,
    'fee',
    v_ticket_revenue,
    v_service_fee,
    v_ticket_revenue + v_service_fee,
    p_processing_cost,
    CASE WHEN p_processing_cost IS NULL THEN NULL ELSE public.money_round(v_service_fee - p_processing_cost, v_currency) END,
    v_fee_rate,
    v_currency,
    COALESCE(v_credit, 0)
  )
  ON CONFLICT (transaction_id) WHERE entry_type = 'fee' DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public._promoter_commission_post(p_reward_event_id uuid, p_delta_minor bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r           public.reward_event;
  v_organizer uuid;
  v_currency  text;
  v_charged   numeric := 0;
  v_returned  numeric := 0;
  v_amount    numeric;
begin
  if coalesce(p_delta_minor, 0) = 0 then
    return;
  end if;
  select * into r from public.reward_event where id = p_reward_event_id;
  if not found or r.rule_key <> 'promoter_commission' or r.is_shadow then
    return;
  end if;

  select le.organizer_id, le.currency into v_organizer, v_currency
  from public.organizer_ledger_entry le
  where le.ticket_checkout_id = r.source_id and le.entry_type = 'earning';
  if v_organizer is null then
    -- record_organizer_earning runs right after ticket issuance; retry.
    raise exception 'organizer earning not recorded yet for checkout %', r.source_id;
  end if;

  select coalesce(sum(-le.amount) filter (where le.entry_type = 'promoter_commission'), 0),
         coalesce(sum(le.amount) filter (where le.entry_type = 'promoter_commission_reversal'), 0)
    into v_charged, v_returned
  from public.organizer_ledger_entry le
  where le.ticket_checkout_id = r.source_id
    and le.entry_type in ('promoter_commission', 'promoter_commission_reversal');

  if p_delta_minor < 0 then
    if v_charged > 0 then
      return;
    end if;
    insert into public.organizer_ledger_entry (
      organizer_id, event_id, ticket_checkout_id, transaction_id, entry_type, amount, currency)
    values (v_organizer, r.event_id, r.source_id, r.transaction_id, 'promoter_commission',
            public.minor_to_major(p_delta_minor, v_currency), v_currency)
    on conflict (ticket_checkout_id) where entry_type = 'promoter_commission' do nothing;
  else
    v_amount := least(public.minor_to_major(p_delta_minor, v_currency), v_charged - v_returned);
    if v_amount > 0 then
      insert into public.organizer_ledger_entry (
        organizer_id, event_id, ticket_checkout_id, transaction_id, entry_type, amount, currency)
      values (v_organizer, r.event_id, r.source_id, r.transaction_id, 'promoter_commission_reversal',
              v_amount, v_currency);
    end if;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_refund_adjustment(p_transaction_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  INSERT INTO public.organizer_ledger_entry (
    organizer_id, event_id, ticket_checkout_id, transaction_id, entry_type, amount, currency
  )
  SELECT
    le.organizer_id,
    le.event_id,
    le.ticket_checkout_id,
    p_transaction_id,
    'refund_adjustment',
    -1 * public.money_round(le.amount / NULLIF(tc.quantity, 0) * refunded.units, le.currency),
    le.currency
  FROM (
    SELECT t.ticket_checkout_id, COUNT(*) AS units
    FROM public.ticket t
    WHERE t.transaction_id = p_transaction_id
      AND t.ticket_checkout_id IS NOT NULL
    GROUP BY t.ticket_checkout_id
  ) refunded
  JOIN public.ticket_checkout tc ON tc.id = refunded.ticket_checkout_id
  JOIN public.organizer_ledger_entry le
    ON le.ticket_checkout_id = tc.id AND le.entry_type = 'earning'
  ON CONFLICT (transaction_id, ticket_checkout_id) WHERE entry_type = 'refund_adjustment' DO NOTHING;
$function$;

CREATE OR REPLACE FUNCTION public.record_refund_release(p_transaction_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  rec          record;
  v_cash       numeric;
  v_credit     numeric;
  v_returned   numeric;
  v_cash_ratio numeric := 1;
begin
  select t.amount, t.credit_amount, t.credit_refunded_amount
    into v_cash, v_credit, v_returned
  from public.transaction t
  where t.id = p_transaction_id;

  -- The credit share of a mixed refund went back to the buyer when the
  -- refund was requested and stays returned; only the cash share failed, so
  -- only that part of the hold goes back to the organizer. The shares are
  -- the same proportions issueRefundCore split the refund by.
  if coalesce(v_returned, 0) > 0 and coalesce(v_cash, 0) + coalesce(v_credit, 0) > 0 then
    v_cash_ratio := coalesce(v_cash, 0) / (coalesce(v_cash, 0) + coalesce(v_credit, 0));
  end if;

  for rec in
    select distinct organizer_id, currency
    from public.organizer_ledger_entry
    where transaction_id = p_transaction_id and entry_type = 'refund_hold'
    order by organizer_id, currency
  loop
    perform pg_advisory_xact_lock(hashtextextended(rec.organizer_id::text || ':' || rec.currency, 0));
  end loop;

  insert into public.organizer_ledger_entry (
    organizer_id, event_id, ticket_checkout_id, transaction_id, entry_type, amount, currency
  )
  select h.organizer_id, h.event_id, h.ticket_checkout_id, h.transaction_id,
         'refund_release', public.money_round(-1 * h.net * v_cash_ratio, h.currency), h.currency
  from (
    select organizer_id, event_id, ticket_checkout_id, transaction_id, currency,
           sum(amount) as net
    from public.organizer_ledger_entry
    where transaction_id = p_transaction_id
      and entry_type in ('refund_hold', 'refund_release')
    group by organizer_id, event_id, ticket_checkout_id, transaction_id, currency
  ) h
  where public.money_round(-1 * h.net * v_cash_ratio, h.currency) > 0;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_transaction_refundable_amount(p_transaction_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(SUM(public.money_round(tc.total_price / NULLIF(tc.quantity, 0) * refunded.units, tt.currency)), 0)
  FROM (
    SELECT t.ticket_checkout_id, COUNT(*) AS units
    FROM public.ticket t
    WHERE t.transaction_id = p_transaction_id
      AND t.ticket_checkout_id IS NOT NULL
    GROUP BY t.ticket_checkout_id
  ) refunded
  JOIN public.ticket_checkout tc ON tc.id = refunded.ticket_checkout_id
  JOIN public.ticket_type tt ON tt.id = tc.ticket_type_id;
$function$;

CREATE OR REPLACE FUNCTION public.record_refund_hold(p_transaction_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  rec record;
begin
  update public.transaction
  set status = 'refund_pending',
      refund_requested_at = coalesce(refund_requested_at, now()),
      updated_at = now()
  where id = p_transaction_id and status = 'successful';

  if not found then
    return;
  end if;

  -- Same lock order as request_organizer_payout, so a withdrawal and a
  -- refund hold never race on one balance snapshot.
  for rec in
    select distinct le.organizer_id, le.currency
    from public.ticket t
    join public.ticket_checkout tc on tc.id = t.ticket_checkout_id
    join public.organizer_ledger_entry le
      on le.ticket_checkout_id = tc.id and le.entry_type = 'earning'
    where t.transaction_id = p_transaction_id and t.ticket_checkout_id is not null
    order by le.organizer_id, le.currency
  loop
    perform pg_advisory_xact_lock(hashtextextended(rec.organizer_id::text || ':' || rec.currency, 0));
  end loop;

  -- Hold the refunded tickets' share of each checkout's earning, minus
  -- whatever is still held from an earlier attempt (the credit share of a
  -- mixed refund stays held when its cash part fails, see
  -- record_refund_release). A first refund has nothing outstanding, so this
  -- is the full share, as before.
  insert into public.organizer_ledger_entry (
    organizer_id, event_id, ticket_checkout_id, transaction_id, entry_type, amount, currency
  )
  select
    le.organizer_id,
    le.event_id,
    le.ticket_checkout_id,
    p_transaction_id,
    'refund_hold',
    target.amount - coalesce(prior.net, 0),
    le.currency
  from (
    select t.ticket_checkout_id, count(*) as units
    from public.ticket t
    where t.transaction_id = p_transaction_id
      and t.ticket_checkout_id is not null
    group by t.ticket_checkout_id
  ) refunded
  join public.ticket_checkout tc on tc.id = refunded.ticket_checkout_id
  join public.organizer_ledger_entry le
    on le.ticket_checkout_id = tc.id and le.entry_type = 'earning'
  cross join lateral (
    select -1 * public.money_round(le.amount / nullif(tc.quantity, 0) * refunded.units, le.currency) as amount
  ) target
  left join lateral (
    select sum(x.amount) as net
    from public.organizer_ledger_entry x
    where x.transaction_id = p_transaction_id
      and x.ticket_checkout_id = le.ticket_checkout_id
      and x.organizer_id = le.organizer_id
      and x.entry_type in ('refund_hold', 'refund_release')
  ) prior on true
  where target.amount - coalesce(prior.net, 0) < 0;
end;
$function$;

CREATE OR REPLACE FUNCTION public.credit_refund_redemption(p_transaction_id uuid, p_amount_minor bigint, p_label text DEFAULT NULL::text)
 RETURNS TABLE(journal_id uuid, refunded_minor bigint, created boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_res        public.credit_reservation;
  v_acct       public.credit_account;
  v_existing   record;
  v_journal    uuid;
  v_first_lot  uuid;
  v_new_lot    uuid;
  v_funding    text;
  v_lot        jsonb;
  v_orig       public.credit_lot;
  v_count      integer;
  v_i          integer := 0;
  v_share      bigint;
  v_given      bigint := 0;
  v_repay_left bigint := 0;
  v_repay      bigint;
  v_new_lots   jsonb := '[]'::jsonb;
begin
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Refund amount must be positive' using errcode = '22023';
  end if;

  select * into v_res from public.credit_reservation cr
  where cr.transaction_id = p_transaction_id and cr.status = 'captured'
  order by cr.captured_at
  limit 1;
  if v_res.id is null then
    raise exception 'No credit was captured for this transaction' using errcode = 'P0002';
  end if;
  if p_amount_minor > v_res.amount_minor then
    raise exception 'Can''t refund more credit than the order used' using errcode = '22023';
  end if;

  perform public._credit_ensure_account(v_res.user_id);
  select * into v_acct from public.credit_account a
  where a.user_id = v_res.user_id
  for update;

  select j.id into v_existing from public.credit_journal j
  where j.idempotency_key = 'redeem.refund:' || p_transaction_id;
  if found then
    return query select v_existing.id, p_amount_minor, false;
    return;
  end if;

  if v_acct.status = 'closed' then
    raise exception 'Credit account is closed' using errcode = '55000';
  end if;
  -- An account in debt repays the debt from returned credit first, like any
  -- other new credit (see credit_grant).
  if v_acct.available_minor < 0 then
    v_repay_left := least(p_amount_minor, -v_acct.available_minor);
  end if;

  v_funding := case v_res.scope when 'promotions' then 'redemption_promotions'
                                else 'redemption_tickets' end;
  v_count := jsonb_array_length(v_res.lots);

  -- New lots first (the journal points at the first one), pro rata by what
  -- each original lot paid; the last lot takes the rounding.
  for v_lot in select * from jsonb_array_elements(v_res.lots)
  loop
    v_i := v_i + 1;
    v_share := case when v_i = v_count then p_amount_minor - v_given
                    else (p_amount_minor * (v_lot ->> 'amount_minor')::bigint) / v_res.amount_minor end;
    continue when v_share <= 0;
    v_given := v_given + v_share;

    select * into v_orig from public.credit_lot l where l.id = (v_lot ->> 'lot_id')::uuid;
    v_repay := least(v_repay_left, v_share);
    v_repay_left := v_repay_left - v_repay;

    insert into public.credit_lot (
      user_id, kind, spend_scope, status, funding_code,
      original_minor, remaining_minor, released_minor,
      withdrawable, withdrawable_at, expires_at, released_at, closed_at,
      source_type, source_id, label
    ) values (
      v_res.user_id, 'refund', coalesce(v_orig.spend_scope, 'any'),
      case when v_share - v_repay = 0 then 'exhausted' else 'active' end,
      v_funding,
      v_share, v_share - v_repay, v_share,
      coalesce(v_orig.withdrawable, false), v_orig.withdrawable_at,
      case when v_orig.id is null or v_orig.expires_at is null then null
           else greatest(v_orig.expires_at, now() + interval '30 days') end,
      now(),
      case when v_share - v_repay = 0 then now() end,
      'transaction', p_transaction_id::text, coalesce(p_label, v_res.label)
    )
    returning id into v_new_lot;

    v_first_lot := coalesce(v_first_lot, v_new_lot);
    v_new_lots := v_new_lots || jsonb_build_array(jsonb_build_object('lot_id', v_new_lot, 'amount_minor', v_share));
  end loop;

  insert into public.credit_journal (
    journal_type, idempotency_key, user_id, user_delta_minor, visible_to_user,
    lot_id, source_type, source_id, actor_type, user_label
  ) values (
    'redeem.refund', 'redeem.refund:' || p_transaction_id, v_res.user_id, p_amount_minor, true,
    v_first_lot, 'transaction', p_transaction_id::text, 'system', coalesce(p_label, v_res.label)
  )
  returning id into v_journal;

  perform public._credit_entry(v_journal, public._credit_system_ledger_id(v_funding), null, -p_amount_minor);
  for v_lot in select * from jsonb_array_elements(v_new_lots)
  loop
    perform public._credit_entry(v_journal, public._credit_user_ledger_id(v_res.user_id, 'available'),
                                 (v_lot ->> 'lot_id')::uuid, (v_lot ->> 'amount_minor')::bigint);
  end loop;

  update public.credit_account a
  set available_minor      = a.available_minor + p_amount_minor,
      lifetime_spent_minor = greatest(a.lifetime_spent_minor - p_amount_minor, 0),
      version              = a.version + 1,
      updated_at           = now()
  where a.user_id = v_res.user_id;

  update public.transaction t
  set credit_refunded_amount = public.minor_to_major(p_amount_minor, t.currency),
      updated_at             = now()
  where t.id = p_transaction_id;

  return query select v_journal, p_amount_minor, true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_organizer_earning(p_ticket_checkout_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_organizer_id uuid;
  v_event_id     uuid;
  v_gross        numeric;
  v_currency     text;
  v_transaction_id uuid;
BEGIN
  SELECT e.organizer_id, e.id, tc.total_price, tt.currency
    INTO v_organizer_id, v_event_id, v_gross, v_currency
  FROM public.ticket_checkout tc
  JOIN public.ticket_type tt ON tt.id = tc.ticket_type_id
  JOIN public.event e ON e.id = tc.event_id
  WHERE tc.id = p_ticket_checkout_id
    AND tc.status = 'paid';

  IF v_organizer_id IS NULL THEN
    RETURN;
  END IF;

  -- The tickets for this checkout were inserted moments ago in the same
  -- transaction, each carrying the transaction that paid for them. A null
  -- here (a free checkout, or a caller that issued no tickets) simply leaves
  -- the column null, exactly as before.
  SELECT t.transaction_id INTO v_transaction_id
  FROM public.ticket t
  WHERE t.ticket_checkout_id = p_ticket_checkout_id
    AND t.transaction_id IS NOT NULL
  LIMIT 1;

  INSERT INTO public.organizer_ledger_entry (
    organizer_id, event_id, ticket_checkout_id, transaction_id,
    entry_type, amount, gross_amount, fee_amount, currency
  ) VALUES (
    v_organizer_id, v_event_id, p_ticket_checkout_id, v_transaction_id,
    'earning', v_gross, v_gross, 0, v_currency
  )
  ON CONFLICT (ticket_checkout_id) WHERE entry_type = 'earning' DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_fee_refund_adjustment(p_transaction_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_fee_row    public.platform_fee_entry%ROWTYPE;
  v_refundable numeric;
BEGIN
  SELECT * INTO v_fee_row
  FROM public.platform_fee_entry
  WHERE transaction_id = p_transaction_id AND entry_type = 'fee';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_refundable := public.get_transaction_refundable_amount(p_transaction_id);

  INSERT INTO public.platform_fee_entry (
    transaction_id, event_id, entry_type,
    ticket_revenue, service_fee, total_customer_payment,
    processing_cost, net_revenue, fee_rate, currency
  ) VALUES (
    p_transaction_id,
    v_fee_row.event_id,
    'fee_refund_adjustment',
    -1 * v_refundable,
    0,
    -1 * v_refundable,
    0,   -- Paystack keeps its charge fee on a refund and reports no separate
         -- per-refund processing cost: the refund itself costs nothing to
         -- process. The original charge's processing cost stays on the 'fee'
         -- row and is unaffected.
    0,   -- Abonten's revenue is unchanged by a refund (the service fee is
         -- retained), so this adjustment's net-revenue impact is 0.
    v_fee_row.fee_rate,
    v_fee_row.currency
  )
  ON CONFLICT (transaction_id) WHERE entry_type = 'fee_refund_adjustment' DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_transaction_history(p_start timestamp with time zone, p_end timestamp with time zone, p_cursor_created_at timestamp with time zone, p_cursor_id uuid, p_limit integer)
 RETURNS TABLE(id uuid, kind text, status text, created_at timestamp with time zone, completed_at timestamp with time zone, amount numeric, currency text, title text, subtitle text, quantity integer, reference uuid, cancelled_quantity integer, refund_status text, refund_requested_at timestamp with time zone, service_fee numeric, total_paid numeric, credit_used numeric)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
        else greatest(public.money_round(s.txn_amount * s.share - s.amount, s.currency), 0::numeric)
      end as service_fee,
      case
        when s.txn_id is null or coalesce(s.txn_credit, 0) = 0 then 0::numeric
        else public.money_round(s.txn_credit * coalesce(s.share, 0), s.currency)
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
$function$;

CREATE OR REPLACE FUNCTION public.get_user_transaction_summary(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(currency text, amount_spent numeric, total_transactions bigint, successful_count bigint, pending_count bigint, failed_count bigint, tickets_purchased bigint, subscriptions_count bigint)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
                public.currency_minor_units(tt.currency)),
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
$function$;

CREATE OR REPLACE FUNCTION public._payout_credit_review(p_organizer_id uuid, p_currency text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with setting as (
    select coalesce(s.credit_share_payout_hold_bps, 2000) as threshold_bps
    from public.reward_program_setting s where s.id = 1
  ),
  settled as (
    select distinct le.event_id
    from public.organizer_ledger_entry le
    where le.organizer_id = p_organizer_id
      and le.currency = p_currency
      and le.entry_type = 'earning'
      and le.created_at > now() - interval '180 days'
      and public.is_event_settled(le.event_id)
  ),
  cleared as (
    select distinct (ev ->> 'event_id')::uuid as event_id
    from public.payout p,
         jsonb_array_elements(coalesce(p.review_details -> 'events', '[]'::jsonb)) ev
    where p.organizer_id = p_organizer_id and p.review_status = 'cleared'
  ),
  sold as (
    select tc.event_id,
           tc.total_price,
           tc.total_price * tr.credit_amount / nullif(tr.amount + tr.credit_amount, 0) as credit_part
    from public.ticket_checkout tc
    join lateral (
      select distinct t.transaction_id
      from public.ticket t
      where t.ticket_checkout_id = tc.id and t.transaction_id is not null
    ) tt on true
    join public.transaction tr on tr.id = tt.transaction_id
    where tc.event_id in (select event_id from settled)
      and tc.status = 'paid'
      and tr.status = 'successful'
  ),
  per_event as (
    select s.event_id,
           sum(s.total_price) as revenue,
           coalesce(sum(s.credit_part), 0) as credit_revenue
    from sold s
    group by s.event_id
  ),
  flagged as (
    select pe.event_id, e.title, pe.revenue, public.money_round(pe.credit_revenue, p_currency) as credit_revenue,
           floor(pe.credit_revenue * 10000 / nullif(pe.revenue, 0))::integer as share_bps
    from per_event pe
    join public.event e on e.id = pe.event_id
    where pe.revenue > 0
      and pe.event_id not in (select event_id from cleared)
      and pe.credit_revenue * 10000 > pe.revenue * (select threshold_bps from setting)
  )
  select case when exists (select 1 from flagged) then
    jsonb_build_object(
      'threshold_bps', (select threshold_bps from setting),
      'events', (select jsonb_agg(jsonb_build_object(
                   'event_id', f.event_id, 'title', f.title, 'revenue', f.revenue,
                   'credit_revenue', f.credit_revenue, 'share_bps', f.share_bps)
                 order by f.share_bps desc) from flagged f))
  end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_organizer_balance(p_organizer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with earning_rows as (
    select
      le.currency::text as cur,
      le.amount as amt,
      le.entry_type,
      public.is_event_settled(le.event_id) as settled
    from public.organizer_ledger_entry le
    where le.entry_type in ('earning', 'refund_adjustment', 'refund_hold', 'refund_release',
                            'promoter_commission', 'promoter_commission_reversal')
      and (p_organizer_id is null or le.organizer_id = p_organizer_id)
  ),
  earning_totals as (
    select
      er.cur,
      coalesce(sum(er.amt) filter (where not er.settled), 0) as pending,
      coalesce(sum(er.amt) filter (where er.settled), 0)     as settled_net,
      coalesce(sum(er.amt), 0)                               as total,
      coalesce(sum(er.amt) filter (
        where er.entry_type in ('earning', 'refund_adjustment',
                                'promoter_commission', 'promoter_commission_reversal')), 0) as booked,
      coalesce(-sum(er.amt) filter (
        where er.entry_type in ('refund_hold', 'refund_release')), 0) as refunds_deducted
    from earning_rows er
    group by er.cur
  ),
  payout_ledger as (
    select le.currency::text as cur, coalesce(sum(le.amount), 0) as net
    from public.organizer_ledger_entry le
    where le.entry_type in ('payout_hold', 'payout_release')
      and (p_organizer_id is null or le.organizer_id = p_organizer_id)
    group by le.currency::text
  ),
  payouts as (
    select
      p.currency::text as cur,
      count(*) filter (where p.status = 'processing')                  as in_flight_count,
      coalesce(sum(p.amount) filter (where p.status = 'processing'), 0) as in_flight_amount
    from public.payout p
    where (p_organizer_id is null or p.organizer_id = p_organizer_id)
    group by p.currency::text
  ),
  currencies as (
    select cur from earning_totals
    union select cur from payout_ledger
    union select cur from payouts
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'currency', c.cur,
    'booked', public.money_round(coalesce(et.booked, 0), c.cur),
    'refundsDeducted', public.money_round(coalesce(et.refunds_deducted, 0), c.cur),
    'totalEarnings', public.money_round(coalesce(et.total, 0), c.cur),
    'pendingSettlement', public.money_round(coalesce(et.pending, 0), c.cur),
    'available', public.money_round(coalesce(et.settled_net, 0) + coalesce(pl.net, 0), c.cur),
    'paidOut', public.money_round(-coalesce(pl.net, 0), c.cur),
    'payoutsInFlight', coalesce(p.in_flight_count, 0),
    'payoutsInFlightAmount', public.money_round(coalesce(p.in_flight_amount, 0), c.cur)
  ) order by c.cur), '[]'::jsonb)
  from currencies c
  left join earning_totals et on et.cur = c.cur
  left join payout_ledger pl on pl.cur = c.cur
  left join payouts p on p.cur = c.cur;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Sanity: nothing rewritten here converts money with a fixed exponent
-- ---------------------------------------------------------------------------

do $$
declare
  v_bad text;
begin
  select string_agg(p.proname, ', ') into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('record_platform_fee', '_promoter_commission_post', 'record_refund_adjustment',
                      'record_refund_release', 'get_transaction_refundable_amount', 'record_refund_hold',
                      'credit_refund_redemption', 'record_organizer_earning', 'record_fee_refund_adjustment',
                      'get_user_transaction_history', 'get_user_transaction_summary',
                      '_payout_credit_review', 'admin_organizer_balance')
    and (p.prosrc ~ '/\s*100(\.0)?\M' or p.prosrc ~ 'round\([^;]*,\s*2\)'
         or p.prosrc ~* 'numeric\s*\(\s*1[025]\s*,\s*2\s*\)');
  if v_bad is not null then
    raise exception 'Fixed-exponent money arithmetic remains in: %', v_bad;
  end if;
end;
$$;
