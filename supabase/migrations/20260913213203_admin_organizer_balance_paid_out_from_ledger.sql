-- Admin metrics phase 4, correction: "paid out" comes from the payout ledger
-- (holds minus releases), not from completed payouts alone. A hold is placed
-- the moment a payout is created and released only if it fails, so the
-- ledger net is money sent plus money reserved for a payout still in flight —
-- exactly what has left the organizer's balance, and what the organizer's
-- own page and the payout guard subtract. Counting only completed payouts
-- would have shown reserved money as still owed.

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
    'booked', round(coalesce(et.booked, 0), 2),
    'refundsDeducted', round(coalesce(et.refunds_deducted, 0), 2),
    'totalEarnings', round(coalesce(et.total, 0), 2),
    'pendingSettlement', round(coalesce(et.pending, 0), 2),
    'available', round(coalesce(et.settled_net, 0) + coalesce(pl.net, 0), 2),
    'paidOut', round(-coalesce(pl.net, 0), 2),
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
