-- Admin console metrics, phase 4: finance figures that match the organizer's.
--
-- Two functions, service_role only:
--
--   admin_finance_overview(from, to, prev_from, prev_to)
--       customer money for the window and the window before it, refunds
--       waiting right now, and organizer money per currency.
--   admin_organizer_balance(organizer_id)
--       the same organizer figures for one person.
--
-- The organizer half is the part that matters. Both functions use the same
-- entry families and the same settlement rule as
-- public.get_organizer_finance_overview() — the function that produces the
-- numbers an organizer sees on their own Finances page, and that
-- request_organizer_payout() / admin_create_payout() enforce when money
-- moves. If these ever disagree, the console is lying to whoever is deciding
-- whether to pay someone. There is an integration test asserting they match
-- (packages/services/src/__integration__/admin-finance-overview.integration.test.ts).
--
-- NOTE: 20260913213203_admin_organizer_balance_paid_out_from_ledger.sql
-- replaces admin_organizer_balance: "paid out" must come from the payout
-- ledger, not completed payouts alone. This file is kept as production
-- applied it, so a replay ends in the same state.
--
-- Change together with:
--   * get_organizer_finance_overview  (20260911104206…, the organizer's view)
--   * admin_create_payout             (20260904033737…, what may be paid)
--   * is_event_settled                (20260819110000…, the 48-hour rule)
--   * packages/core/src/admin/metricDefinitions.ts and docs/admin/metrics.md

create or replace function public.admin_organizer_balance(
  p_organizer_id uuid default null
)
  returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $function$
  with earning_rows as (
    select
      le.currency::text as cur,
      le.amount as amt,
      le.entry_type,
      -- Settlement is per event and per row here. For one organizer this is
      -- a handful of rows; the all-organizer call below resolves it once per
      -- event instead.
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
      -- What was earned before refunds, and what refunds took back, so the
      -- console can show the two separately rather than only their net.
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
      coalesce(sum(p.amount) filter (where p.status = 'completed'), 0) as paid,
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
    'booked', round(coalesce(et.booked, 0), 2),
    'refundsDeducted', round(coalesce(et.refunds_deducted, 0), 2),
    -- Identical to get_organizer_finance_overview: total_earnings,
    -- pending_balance, available_balance.
    'totalEarnings', round(coalesce(et.total, 0), 2),
    'pendingSettlement', round(coalesce(et.pending, 0), 2),
    'available', round(coalesce(et.settled_net, 0) + coalesce(pl.net, 0), 2),
    'paidOut', round(coalesce(p.paid, 0), 2),
    'payoutsInFlight', coalesce(p.in_flight_count, 0),
    'payoutsInFlightAmount', round(coalesce(p.in_flight_amount, 0), 2)
  ) order by c.cur), '[]'::jsonb)
  from currencies c
  left join earning_totals et on et.cur = c.cur
  left join payout_ledger pl on pl.cur = c.cur
  left join payouts p on p.cur = c.cur;
$function$;

revoke execute on function public.admin_organizer_balance(uuid) from public, anon, authenticated;
grant  execute on function public.admin_organizer_balance(uuid) to service_role;

comment on function public.admin_organizer_balance(uuid) is
  'Organizer money per currency — booked, refunds deducted, pending settlement, available, paid out — using the same entry families and settlement rule as get_organizer_finance_overview(). Pass null for every organizer at once.';

create or replace function public.admin_finance_overview(
  p_from timestamptz,
  p_to timestamptz,
  p_prev_from timestamptz,
  p_prev_to timestamptz
)
  returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $function$
  with windows as (
    select 'current'::text as name, p_from as f, p_to as t
    union all
    select 'previous', p_prev_from, p_prev_to
  ),
  window_money as (
    select
      w.name,
      fe.*,
      (select count(*) from public.transaction tr
        where tr.status = 'successful'
          and tr.created_at >= w.f and tr.created_at < w.t) as payments_successful
    from windows w
    cross join lateral (
      select
        round(coalesce(sum(ticket_revenue) filter (where entry_type = 'fee'), 0), 2)         as ticket_revenue,
        round(coalesce(sum(total_customer_payment) filter (where entry_type = 'fee'), 0), 2) as total_charged,
        round(coalesce(sum(service_fee) filter (where entry_type = 'fee'), 0), 2)            as service_fee_revenue,
        round(coalesce(sum(processing_cost) filter (where entry_type = 'fee'), 0), 2)        as processing_cost,
        round(coalesce(sum(net_revenue) filter (where entry_type = 'fee'), 0), 2)            as net_platform_revenue,
        count(*) filter (where entry_type = 'fee')                                            as fee_entries,
        count(*) filter (where entry_type = 'fee' and net_revenue is not null)                as fee_entries_with_known_cost,
        round(coalesce(sum(credit_applied) filter (where entry_type = 'fee'), 0), 2)          as credit_applied,
        count(*) filter (where entry_type = 'fee' and credit_applied > 0)                     as orders_using_credit,
        count(*) filter (where entry_type = 'fee_refund_adjustment')                          as refunds_issued,
        round(coalesce(-sum(ticket_revenue) filter (where entry_type = 'fee_refund_adjustment'), 0), 2) as cash_refunded
      from public.platform_fee_entry f
      where f.created_at >= w.f and f.created_at < w.t
    ) fe
  )
  select jsonb_build_object(
    'current',  (select to_jsonb(m) - 'name' from window_money m where m.name = 'current'),
    'previous', (select to_jsonb(m) - 'name' from window_money m where m.name = 'previous'),
    -- Open refund requests are a "right now" queue, not a window: an admin
    -- has to see every one of them whenever the sale happened.
    'refundsPending', (select count(*) from public.transaction where status = 'refund_pending'),
    'refundsPendingAmount', round(coalesce((
      select sum(coalesce(f.ticket_revenue, tr.amount))
      from public.transaction tr
      left join public.platform_fee_entry f
        on f.transaction_id = tr.id and f.entry_type = 'fee'
      where tr.status = 'refund_pending'
    ), 0), 2),
    'organizerMoney', public.admin_organizer_balance(null),
    'activeFeeRate', (select fee_rate from public.platform_fee_config where is_active limit 1),
    'currency', coalesce(
      (select currency from public.platform_fee_config where is_active limit 1),
      'GHS')
  );
$function$;

revoke execute on function public.admin_finance_overview(timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant  execute on function public.admin_finance_overview(timestamptz, timestamptz, timestamptz, timestamptz) to service_role;

comment on function public.admin_finance_overview(timestamptz, timestamptz, timestamptz, timestamptz) is
  'Finance overview in one round trip: customer money for the window and the one before it, open refund requests right now, and organizer money per currency from admin_organizer_balance().';
