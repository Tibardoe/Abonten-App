-- Abonten Rewards, Phase 3: paying for tickets with Abonten Credit.
--
-- The reservation machinery from Phase 2 (credit_reserve / capture /
-- release, scope 'tickets', target 'ticket_payment_group') already covers the
-- checkout itself. This migration adds what tickets need on top:
--
--   * credit_spendable returns the ticket-order limits (max credit share of
--     an order, whether credit may pay for all of it) so the quote and the
--     payment use one rule.
--   * record_platform_fee is credit-aware: the service fee is
--     (cash + credit) - ticket revenue, and platform_fee_entry.credit_applied
--     records the credit. Before this, a part-credit order would have
--     recorded a zero fee. The organizer is still paid 100% of the ticket
--     price; credit spent on a ticket is Abonten's cost, already booked when
--     the credit was granted, so net_revenue does not subtract it again.
--   * credit_refund_redemption: a refund of a credit-paid order gives the
--     credit share back as a NEW lot (journal redeem.refund) with the scope
--     and withdrawable flag of the lots it was paid from, expiring at the
--     later of their expiry and 30 days from now. Idempotent per
--     transaction. transaction.credit_refunded_amount records it.
--   * cancel_event_and_release_tickets returns orders paid entirely with
--     credit too (it filtered amount > 0, so they would never have been
--     refunded when an organizer cancelled).
--   * get_user_transaction_history: the service fee and total paid count the
--     credit, and a new credit_used column says how much of it was credit.
--   * Payout review: a payout whose organizer sold a large share of an
--     event's tickets for credit is held for a person to review before it
--     can be completed (the "farm credit, spend it at your own event, cash it
--     out as earnings" attack). Threshold: reward_program_setting
--     .credit_share_payout_hold_bps (20%). Set by a trigger on payout insert,
--     so both request_organizer_payout and admin_create_payout get it
--     unchanged; admin_clear_payout_review releases it.

-- ---------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------

alter table public.transaction
  add column if not exists credit_refunded_amount numeric(12,2) not null default 0;
alter table public.transaction
  add constraint transaction_credit_refunded_check
  check (credit_refunded_amount >= 0 and credit_refunded_amount <= credit_amount);

alter table public.platform_fee_entry
  add column if not exists credit_applied numeric(12,2) not null default 0;

alter table public.payout
  add column if not exists review_status text not null default 'none',
  add column if not exists review_reason text,
  add column if not exists review_details jsonb,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;
alter table public.payout
  add constraint payout_review_status_check
  check (review_status in ('none', 'required', 'cleared'));

create index if not exists idx_payout_review_required
  on public.payout (requested_at) where review_status = 'required';

-- ---------------------------------------------------------------------
-- credit_spendable: ticket-order limits
-- ---------------------------------------------------------------------

create or replace function public.credit_spendable(p_user_id uuid, p_scope text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_setting public.reward_program_setting;
  v_acct    public.credit_account;
  v_free    bigint;
  v_limits  jsonb;
begin
  select * into v_setting from public.reward_program_setting where id = 1;

  -- How much of one order credit may pay for. Promotions: all of it.
  v_limits := case p_scope
    when 'tickets' then jsonb_build_object(
      'max_share_bps', coalesce(v_setting.max_credit_share_of_ticket_order_bps, 10000),
      'allow_full_credit', coalesce(v_setting.allow_full_credit_ticket_orders, false))
    else jsonb_build_object('max_share_bps', 10000, 'allow_full_credit', true)
  end;

  if not public.rewards_enabled_for_user(p_user_id) then
    return jsonb_build_object('spendable_minor', 0, 'blocked_reason', 'program_off') || v_limits;
  end if;
  if (p_scope = 'promotions' and not v_setting.redeem_promotions_enabled)
     or (p_scope = 'tickets' and not v_setting.redeem_tickets_enabled) then
    return jsonb_build_object('spendable_minor', 0, 'blocked_reason', 'redemption_off') || v_limits;
  end if;

  select * into v_acct from public.credit_account a
  where a.user_id = p_user_id and a.currency = 'GHS';
  if not found then
    return jsonb_build_object('spendable_minor', 0, 'blocked_reason', 'no_credit') || v_limits;
  end if;
  if v_acct.status <> 'active' then
    return jsonb_build_object('spendable_minor', 0, 'blocked_reason', 'account_' || v_acct.status) || v_limits;
  end if;
  if v_acct.available_minor < 0 then
    return jsonb_build_object('spendable_minor', 0, 'blocked_reason', 'in_debt') || v_limits;
  end if;

  select coalesce(sum(l.remaining_minor - l.held_minor), 0) into v_free
  from public.credit_lot l
  where l.user_id = p_user_id
    and l.status = 'active'
    and l.remaining_minor > l.held_minor
    and l.spend_scope = any (public._credit_scopes_for(p_scope))
    and (l.expires_at is null or l.expires_at > now());

  return jsonb_build_object(
    'spendable_minor', least(v_free, v_acct.available_minor),
    'blocked_reason', case when v_free = 0 then 'no_credit' end,
    'min_cash_charge_minor', v_setting.min_cash_charge_minor
  ) || v_limits;
end;
$$;

-- ---------------------------------------------------------------------
-- credit_refund_redemption
-- ---------------------------------------------------------------------

-- Gives p_amount_minor of the credit a transaction was paid with back to the
-- user, split across new lots in proportion to the lots it was paid from.
-- Idempotent per transaction (key 'redeem.refund:<transaction id>'): a
-- replay returns the original journal with created = false. Refuses more
-- than was captured for the transaction.
create or replace function public.credit_refund_redemption(
  p_transaction_id uuid,
  p_amount_minor   bigint,
  p_label          text default null
)
returns table (journal_id uuid, refunded_minor bigint, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
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
  where a.user_id = v_res.user_id and a.currency = 'GHS'
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
  where a.user_id = v_res.user_id and a.currency = 'GHS';

  update public.transaction t
  set credit_refunded_amount = round(p_amount_minor / 100.0, 2),
      updated_at             = now()
  where t.id = p_transaction_id;

  return query select v_journal, p_amount_minor, true;
end;
$$;

-- ---------------------------------------------------------------------
-- record_platform_fee: credit-aware
-- ---------------------------------------------------------------------

create or replace function public.record_platform_fee(p_transaction_id uuid, p_processing_cost numeric default null::numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
DECLARE
  v_ticket_revenue numeric(12,2);
  v_currency       varchar(3);
  v_distinct_events integer;
  v_event_id       uuid;
  v_fee_rate       numeric(6,4);
  v_txn_amount     numeric(12,2);
  v_credit         numeric(12,2);
  v_service_fee    numeric(12,2);
BEGIN
  SELECT
    COALESCE(SUM(x.total_price), 0),
    MIN(x.currency),
    COUNT(DISTINCT x.event_id),
    (array_agg(x.event_id))[1]
  INTO v_ticket_revenue, v_currency, v_distinct_events, v_event_id
  FROM (
    SELECT DISTINCT tc.id, tc.total_price, tc.event_id, COALESCE(tt.currency, 'GHS') AS currency
    FROM public.ticket t
    JOIN public.ticket_checkout tc ON tc.id = t.ticket_checkout_id
    JOIN public.ticket_type tt ON tt.id = tc.ticket_type_id
    WHERE t.transaction_id = p_transaction_id
      AND t.ticket_checkout_id IS NOT NULL
  ) x;

  IF v_ticket_revenue IS NULL OR v_ticket_revenue <= 0 THEN
    RETURN;
  END IF;

  v_fee_rate := COALESCE(public.get_active_platform_fee_rate(v_currency::text), 0);

  -- What the customer paid in total: the cash Paystack collected plus any
  -- Abonten Credit (transaction.amount is cash only).
  SELECT amount, COALESCE(credit_amount, 0) INTO v_txn_amount, v_credit
  FROM public.transaction
  WHERE id = p_transaction_id;

  v_service_fee := round(COALESCE(v_txn_amount + v_credit, v_ticket_revenue) - v_ticket_revenue, 2);
  IF v_service_fee < 0 THEN
    v_service_fee := round(v_ticket_revenue * v_fee_rate, 2);
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
    CASE WHEN p_processing_cost IS NULL THEN NULL ELSE round(v_service_fee - p_processing_cost, 2) END,
    v_fee_rate,
    v_currency,
    COALESCE(v_credit, 0)
  )
  ON CONFLICT (transaction_id) WHERE entry_type = 'fee' DO NOTHING;
END;
$function$;

-- ---------------------------------------------------------------------
-- cancel_event_and_release_tickets: include credit-paid orders
-- ---------------------------------------------------------------------

create or replace function public.cancel_event_and_release_tickets(p_event_id uuid)
returns table(refund_transaction_id uuid, attendee_user_id uuid, paystack_reference text, transaction_amount numeric, transaction_currency character varying, event_title text)
language plpgsql
security definer
set search_path = ''
as $function$
DECLARE
  v_event_id uuid;
  v_event_title text;
  v_current_status text;
BEGIN
  UPDATE public.event
     SET status = 'canceled'
   WHERE id = p_event_id
     AND organizer_id = auth.uid()
     AND status IN ('draft', 'published')
  RETURNING id, title INTO v_event_id, v_event_title;

  IF v_event_id IS NULL THEN
    SELECT status INTO v_current_status
      FROM public.event
     WHERE id = p_event_id AND organizer_id = auth.uid();

    IF v_current_status IS NULL THEN
      RAISE EXCEPTION 'Event not found or not owned by caller';
    ELSIF v_current_status = 'canceled' THEN
      RAISE EXCEPTION 'Event is already cancelled';
    ELSE
      RAISE EXCEPTION 'Event cannot be cancelled from its current status';
    END IF;
  END IF;

  RETURN QUERY
  WITH cancelled_tickets AS (
    UPDATE public.ticket t
       SET status = 'cancelled', updated_at = now()
      FROM public.ticket_type tt
     WHERE t.ticket_type_id = tt.id
       AND tt.event_id = v_event_id
       AND t.status IN ('active', 'used')
    RETURNING t.id AS ticket_id, t.user_id, t.transaction_id
  ),
  cancel_attendance AS (
    UPDATE public.attendance
       SET status = 'cancelled'
     WHERE event_id = v_event_id
       AND status = 'attending'
    RETURNING id
  ),
  cancel_checkouts AS (
    UPDATE public.ticket_checkout
       SET status = 'cancelled', updated_at = now()
     WHERE event_id = v_event_id
       AND status = 'paid'
    RETURNING id
  ),
  refundable AS (
    SELECT
      ct.user_id,
      ct.transaction_id,
      tr.amount,
      -- Orders paid (partly or wholly) with Abonten Credit are refundable
      -- too: an order paid entirely with credit has amount = 0.
      COALESCE(tr.amount, 0) + COALESCE(tr.credit_amount, 0) AS paid_total,
      tr.currency,
      tr.paystack_reference
    FROM cancelled_tickets ct
    LEFT JOIN public.transaction tr ON tr.id = ct.transaction_id
  ),
  notify AS (
    INSERT INTO public.notification (user_id, type, title, body, link)
    SELECT DISTINCT ON (r.user_id)
      r.user_id,
      'event_cancelled',
      'Event cancelled',
      CASE
        WHEN r.paid_total > 0 THEN format(
          'The organizer has cancelled %s. Your ticket is no longer valid. A refund will be issued to the payment method used for your ticket.',
          v_event_title
        )
        ELSE format(
          'The organizer has cancelled %s. Your registration has been cancelled.',
          v_event_title
        )
      END,
      CASE WHEN r.paid_total > 0 THEN '/manage/my-events?tab=refunds' ELSE '/manage/my-events?tab=cancelled' END
    FROM refundable r
    ORDER BY r.user_id, (r.paid_total > 0) DESC NULLS LAST
    RETURNING id
  )
  -- transaction_amount is what the attendee paid in total (cash + credit),
  -- as it was for cash-only orders.
  SELECT DISTINCT
    r.transaction_id, r.user_id, r.paystack_reference, r.paid_total, r.currency, v_event_title
    FROM refundable r
   WHERE r.transaction_id IS NOT NULL AND r.paid_total > 0;
END;
$function$;

-- ---------------------------------------------------------------------
-- get_user_transaction_history: count credit in what was paid
-- ---------------------------------------------------------------------

drop function if exists public.get_user_transaction_history(timestamptz, timestamptz, timestamptz, uuid, integer);

create function public.get_user_transaction_history(
  p_start timestamp with time zone,
  p_end timestamp with time zone,
  p_cursor_created_at timestamp with time zone,
  p_cursor_id uuid,
  p_limit integer
)
returns table(id uuid, kind text, status text, created_at timestamp with time zone, completed_at timestamp with time zone, amount numeric, currency text, title text, subtitle text, quantity integer, reference uuid, cancelled_quantity integer, refund_status text, refund_requested_at timestamp with time zone, service_fee numeric, total_paid numeric, credit_used numeric)
language plpgsql
set search_path = ''
as $function$
BEGIN
  RETURN QUERY
  WITH raw AS (
    SELECT
      tc.id,
      'ticket'::text AS kind,
      tc.status,
      (tc.created_at AT TIME ZONE 'UTC') AS created_at,
      tc.completed_at,
      tc.total_price AS amount,
      COALESCE(tt.currency, 'GHS') AS currency,
      e.title,
      tt.type AS subtitle,
      tc.quantity,
      COALESCE(tc.checkout_session_id, tc.id) AS reference,
      tix.cancelled_quantity,
      tix.refund_status,
      tix.refund_requested_at,
      tix.txn_id,
      tix.txn_amount,
      tix.txn_credit
    FROM public.ticket_checkout tc
    LEFT JOIN public.ticket_type tt ON tt.id = tc.ticket_type_id
    LEFT JOIN public.event e ON e.id = tc.event_id
    LEFT JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE t.status = 'cancelled')::integer AS cancelled_quantity,
        (array_agg(tr.status ORDER BY t.updated_at DESC NULLS LAST) FILTER (WHERE t.status = 'cancelled'))[1] AS refund_status,
        (array_agg(tr.refund_requested_at ORDER BY t.updated_at DESC NULLS LAST) FILTER (WHERE t.status = 'cancelled'))[1] AS refund_requested_at,
        (array_agg(t.transaction_id) FILTER (WHERE t.transaction_id IS NOT NULL))[1] AS txn_id,
        -- Everything the customer paid: cash plus Abonten Credit.
        max(tr.amount + COALESCE(tr.credit_amount, 0)) AS txn_amount,
        max(COALESCE(tr.credit_amount, 0)) AS txn_credit
      FROM public.ticket t
      LEFT JOIN public.transaction tr ON tr.id = t.transaction_id
      WHERE t.ticket_checkout_id = tc.id
    ) tix ON true
    WHERE tc.user_id = auth.uid()
      AND (p_start IS NULL OR (tc.created_at AT TIME ZONE 'UTC') >= p_start)
      AND (p_end   IS NULL OR (tc.created_at AT TIME ZONE 'UTC') <= p_end)

    UNION ALL

    SELECT
      sc.id,
      'subscription'::text,
      sc.status,
      sc.created_at,
      sc.completed_at,
      sc.total_price,
      'GHS'::text,
      sc.subscription_plan_name,
      'Subscription'::text,
      NULL::integer,
      sc.id,
      NULL::integer,
      NULL::text,
      NULL::timestamptz,
      NULL::uuid,
      NULL::numeric,
      NULL::numeric
    FROM public.subscription_checkout sc
    WHERE sc.user_id = auth.uid()
      AND (p_start IS NULL OR sc.created_at >= p_start)
      AND (p_end   IS NULL OR sc.created_at <= p_end)
  ),
  shared AS (
    -- This row's share of its transaction (one Paystack charge can cover
    -- several checkout rows).
    SELECT
      r.*,
      r.amount / NULLIF((
        SELECT SUM(tc2.total_price)
        FROM public.ticket_checkout tc2
        WHERE tc2.id IN (
          SELECT DISTINCT t2.ticket_checkout_id
          FROM public.ticket t2
          WHERE t2.transaction_id = r.txn_id
            AND t2.ticket_checkout_id IS NOT NULL
        )
      ), 0) AS share
    FROM raw r
  ),
  priced AS (
    SELECT
      s.*,
      CASE
        WHEN s.txn_id IS NULL OR s.txn_amount IS NULL THEN 0::numeric
        ELSE GREATEST(round(s.txn_amount * s.share - s.amount, 2), 0::numeric)
      END AS service_fee,
      CASE
        WHEN s.txn_id IS NULL OR COALESCE(s.txn_credit, 0) = 0 THEN 0::numeric
        ELSE round(s.txn_credit * COALESCE(s.share, 0), 2)
      END AS credit_used
    FROM shared s
  )
  SELECT
    u.id, u.kind, u.status, u.created_at, u.completed_at, u.amount, u.currency,
    u.title, u.subtitle, u.quantity, u.reference, u.cancelled_quantity,
    u.refund_status, u.refund_requested_at,
    u.service_fee,
    u.amount + u.service_fee AS total_paid,
    u.credit_used
  FROM priced u
  WHERE p_cursor_created_at IS NULL
     OR u.created_at < p_cursor_created_at
     OR (u.created_at = p_cursor_created_at AND u.id < p_cursor_id)
  ORDER BY u.created_at DESC, u.id DESC
  LIMIT p_limit;
END;
$function$;

-- ---------------------------------------------------------------------
-- Payout review for credit-funded sales
-- ---------------------------------------------------------------------

-- Events of this organizer, settled in the last 180 days, where more than
-- the configured share of ticket revenue was paid with credit -- skipping
-- events a person already cleared on an earlier payout.
create or replace function public._payout_credit_review(p_organizer_id uuid, p_currency text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
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
    select pe.event_id, e.title, pe.revenue, round(pe.credit_revenue, 2) as credit_revenue,
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
$$;

create or replace function public.payout_flag_credit_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_details jsonb;
begin
  v_details := public._payout_credit_review(new.organizer_id, new.currency);
  if v_details is not null then
    new.review_status  := 'required';
    new.review_reason  := 'credit_share';
    new.review_details := v_details;
  end if;
  return new;
end;
$$;

create trigger payout_credit_review
  before insert on public.payout
  for each row execute function public.payout_flag_credit_review();

-- A payout held for review can be failed or cancelled, but not completed
-- until someone clears the review.
create or replace function public.payout_guard_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status <> 'completed'
     and new.review_status = 'required' then
    raise exception 'This payout is held for review (credit-funded sales). Clear the review first.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger payout_guard_review
  before update on public.payout
  for each row execute function public.payout_guard_review();

create or replace function public.admin_clear_payout_review(
  p_payout_id uuid,
  p_admin_id  uuid,
  p_note      text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payout public.payout;
begin
  if coalesce(length(btrim(p_note)), 0) = 0 then
    raise exception 'A review note is required' using errcode = '22023';
  end if;
  select * into v_payout from public.payout where id = p_payout_id for update;
  if v_payout.id is null then
    raise exception 'Payout not found' using errcode = 'P0002';
  end if;
  if v_payout.review_status <> 'required' then
    raise exception 'This payout is not held for review' using errcode = '55000';
  end if;
  update public.payout
  set review_status = 'cleared',
      reviewed_by   = p_admin_id,
      reviewed_at   = now(),
      review_note   = btrim(p_note),
      updated_at    = now()
  where id = p_payout_id;
  return 'cleared';
end;
$$;

-- ---------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------

revoke all on function public.credit_spendable(uuid, text) from public, anon, authenticated;
grant execute on function public.credit_spendable(uuid, text) to service_role;

revoke all on function public.credit_refund_redemption(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.credit_refund_redemption(uuid, bigint, text) to service_role;

revoke all on function public.record_platform_fee(uuid, numeric) from public, anon, authenticated;
grant execute on function public.record_platform_fee(uuid, numeric) to service_role;

revoke all on function public.cancel_event_and_release_tickets(uuid) from public, anon;
grant execute on function public.cancel_event_and_release_tickets(uuid) to authenticated, service_role;

grant execute on function public.get_user_transaction_history(timestamptz, timestamptz, timestamptz, uuid, integer)
  to anon, authenticated, service_role;

revoke all on function public._payout_credit_review(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.payout_flag_credit_review() from public, anon, authenticated, service_role;
revoke all on function public.payout_guard_review() from public, anon, authenticated, service_role;

revoke all on function public.admin_clear_payout_review(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_clear_payout_review(uuid, uuid, text) to service_role;
