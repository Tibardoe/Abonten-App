-- Global markets, part 11: admin and organizer money reports are per
-- currency.
--
-- Found in the hardening audit: admin_dashboard_kpis, admin_finance_overview
-- and admin_platform_analytics summed platform_fee_entry across every
-- currency and labelled the total with the default market's currency, and
-- get_organizer_sales_timeline added up an organizer's sales in every
-- currency they sell in. With one live market that was invisible; with a
-- second it would add cedis to naira. Each now takes `p_currency` (default:
-- the default market's currency, or for an organizer the currency they sell
-- most in), filters every money figure by it, and says which currencies
-- have activity so the screens can offer a switcher.
--
-- Each function is dropped and recreated with the extra parameter last and
-- defaulted, so a caller still passing the old arguments keeps working.

create or replace function public.money_currencies_in_use()
  returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(jsonb_agg(c order by c), '[]'::jsonb)
  from (
    select distinct upper(currency::text) as c from public.platform_fee_entry
    union
    select distinct upper(currency::text) from public.transaction
    union
    select public.default_market_currency()::text
  ) s;
$$;
revoke all on function public.money_currencies_in_use() from public, anon, authenticated;
grant execute on function public.money_currencies_in_use() to service_role;

drop function if exists public.admin_dashboard_kpis(timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.admin_dashboard_kpis(p_from timestamp with time zone, p_to timestamp with time zone, p_prev_from timestamp with time zone, p_prev_to timestamp with time zone, p_currency text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with cur as (
    select upper(coalesce(p_currency, public.default_market_currency()::text)) as code
  ),
  windows as (
    select 'current'::text as name, p_from as f, p_to as t
    union all
    select 'previous', p_prev_from, p_prev_to
  ),
  range_metrics as (
    select
      w.name,
      (select count(*) from public.user_info u
         where u.created_at >= w.f and u.created_at < w.t)          as new_users,
      (select count(*) from public.event e
         where e.created_at >= w.f and e.created_at < w.t)          as new_events,
      (select count(*) from public.place p
         where p.created_at >= w.f and p.created_at < w.t)          as new_places,
      (select count(*) from public.ticket tk
         where tk.issued_at >= w.f and tk.issued_at < w.t
           and tk.transaction_id is not null
           and tk.status <> 'cancelled')                            as paid_tickets,
      (select count(*) from public.ticket tk
         where tk.issued_at >= w.f and tk.issued_at < w.t
           and tk.transaction_id is null
           and tk.status <> 'cancelled')                            as free_registrations,
      (select count(*) from public.ticket tk
         where tk.issued_at >= w.f and tk.issued_at < w.t
           and tk.status = 'cancelled')                             as tickets_cancelled,
      (select count(distinct ev.organizer_id)
         from public.ticket tk
         join public.ticket_type tt on tt.id = tk.ticket_type_id
         join public.event ev on ev.id = tt.event_id
        where tk.issued_at >= w.f and tk.issued_at < w.t
          and tk.transaction_id is not null
          and tk.status <> 'cancelled')                             as organizers_with_sales,
      fe.gross_ticket_sales,
      fe.total_charged,
      fe.service_fee_revenue,
      fe.processing_cost,
      fe.net_platform_revenue,
      fe.fee_entries,
      fe.fee_entries_with_known_cost,
      fe.credit_applied,
      fe.orders_using_credit,
      fe.refunds_issued,
      fe.cash_refunded,
      (select count(*) from public.transaction tr
         where tr.status = 'successful'
           and tr.currency = (select code from cur)
           and tr.created_at >= w.f and tr.created_at < w.t)        as payments_successful
    from windows w
    cross join lateral (
      select
        coalesce(sum(ticket_revenue) filter (where entry_type = 'fee'), 0)            as gross_ticket_sales,
        coalesce(sum(total_customer_payment) filter (where entry_type = 'fee'), 0)    as total_charged,
        coalesce(sum(service_fee) filter (where entry_type = 'fee'), 0)               as service_fee_revenue,
        coalesce(sum(processing_cost) filter (where entry_type = 'fee'), 0)           as processing_cost,
        coalesce(sum(net_revenue) filter (where entry_type = 'fee'), 0)               as net_platform_revenue,
        count(*) filter (where entry_type = 'fee')                                    as fee_entries,
        count(*) filter (where entry_type = 'fee' and net_revenue is not null)        as fee_entries_with_known_cost,
        coalesce(sum(credit_applied) filter (where entry_type = 'fee'), 0)            as credit_applied,
        count(*) filter (where entry_type = 'fee' and credit_applied > 0)             as orders_using_credit,
        count(*) filter (where entry_type = 'fee_refund_adjustment')                  as refunds_issued,
        coalesce(-sum(ticket_revenue) filter (where entry_type = 'fee_refund_adjustment'), 0) as cash_refunded
      from public.platform_fee_entry f
      where f.created_at >= w.f and f.created_at < w.t
        and f.currency = (select code from cur)
    ) fe
  )
  select jsonb_build_object(
    'snapshot', jsonb_build_object(
      'activeUsers',     (select count(*) from public.user_info where status_id = 1),
      'allAccounts',     (select count(*) from public.user_info),
      'organizers',      (select count(distinct organizer_id) from public.event where status <> 'draft'),
      'placeOwners',     (select count(distinct owner_id) from public.place where owner_id is not null),
      'eventsPublished', (select count(*) from public.event where status = 'published'),
      'eventsAll',       (select count(*) from public.event),
      'places',          (select count(*) from public.place),
      'refundsPending',  (select count(*) from public.transaction where status = 'refund_pending' and currency = (select code from cur)),
      'refundsPendingAmount', (
        -- Only the ticket revenue can go back: the service fee is retained.
        -- A pre-fee-model transaction has no fee entry, so fall back to what
        -- was charged rather than reporting nothing refundable.
        select coalesce(sum(coalesce(f.ticket_revenue, tr.amount)), 0)
        from public.transaction tr
        left join public.platform_fee_entry f
          on f.transaction_id = tr.id and f.entry_type = 'fee'
        where tr.status = 'refund_pending'
          and tr.currency = (select code from cur)
      ),
      'currency', (select code from cur),
      'currencies', public.money_currencies_in_use()
    ),
    'current',  (select to_jsonb(r) - 'name' from range_metrics r where r.name = 'current'),
    'previous', (select to_jsonb(r) - 'name' from range_metrics r where r.name = 'previous'),
    'health', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'key', h.check_key,
               'ok', h.ok,
               'latencyMs', h.latency_ms,
               'detail', h.detail,
               'checkedAt', h.checked_at
             ) order by h.check_key), '[]'::jsonb)
      from (
        select distinct on (check_key) check_key, ok, latency_ms, detail, checked_at
        from public.health_check_result
        order by check_key, checked_at desc
      ) h
    ),
    'needsAttention', public.admin_dashboard_counts()
  );
$function$;

revoke all on function public.admin_dashboard_kpis(timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, text) from public, anon, authenticated;
grant execute on function public.admin_dashboard_kpis(timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, text) to service_role;

drop function if exists public.admin_finance_overview(timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.admin_finance_overview(p_from timestamp with time zone, p_to timestamp with time zone, p_prev_from timestamp with time zone, p_prev_to timestamp with time zone, p_currency text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with cur as (
    select upper(coalesce(p_currency, public.default_market_currency()::text)) as code
  ),
  windows as (
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
          and tr.currency = (select code from cur)
          and tr.created_at >= w.f and tr.created_at < w.t) as payments_successful
    from windows w
    cross join lateral (
      select
        public.money_round(coalesce(sum(ticket_revenue) filter (where entry_type = 'fee'), 0), (select code from cur))         as ticket_revenue,
        public.money_round(coalesce(sum(total_customer_payment) filter (where entry_type = 'fee'), 0), (select code from cur)) as total_charged,
        public.money_round(coalesce(sum(service_fee) filter (where entry_type = 'fee'), 0), (select code from cur))            as service_fee_revenue,
        public.money_round(coalesce(sum(processing_cost) filter (where entry_type = 'fee'), 0), (select code from cur))        as processing_cost,
        public.money_round(coalesce(sum(net_revenue) filter (where entry_type = 'fee'), 0), (select code from cur))            as net_platform_revenue,
        count(*) filter (where entry_type = 'fee')                                            as fee_entries,
        count(*) filter (where entry_type = 'fee' and net_revenue is not null)                as fee_entries_with_known_cost,
        public.money_round(coalesce(sum(credit_applied) filter (where entry_type = 'fee'), 0), (select code from cur))          as credit_applied,
        count(*) filter (where entry_type = 'fee' and credit_applied > 0)                     as orders_using_credit,
        count(*) filter (where entry_type = 'fee_refund_adjustment')                          as refunds_issued,
        public.money_round(coalesce(-sum(ticket_revenue) filter (where entry_type = 'fee_refund_adjustment'), 0), (select code from cur)) as cash_refunded
      from public.platform_fee_entry f
      where f.created_at >= w.f and f.created_at < w.t
        and f.currency = (select code from cur)
    ) fe
  )
  select jsonb_build_object(
    'current',  (select to_jsonb(m) - 'name' from window_money m where m.name = 'current'),
    'previous', (select to_jsonb(m) - 'name' from window_money m where m.name = 'previous'),
    -- Open refund requests are a "right now" queue, not a window: an admin
    -- has to see every one of them whenever the sale happened.
    'refundsPending', (select count(*) from public.transaction where status = 'refund_pending' and currency = (select code from cur)),
    'refundsPendingAmount', public.money_round(coalesce((
      select sum(coalesce(f.ticket_revenue, tr.amount))
      from public.transaction tr
      left join public.platform_fee_entry f
        on f.transaction_id = tr.id and f.entry_type = 'fee'
      where tr.status = 'refund_pending'
        and tr.currency = (select code from cur)
    ), 0), (select code from cur)),
    'organizerMoney', public.admin_organizer_balance(null),
    'activeFeeRate', (select fee_rate from public.platform_fee_config where is_active limit 1),
    'currency', (select code from cur),
    'currencies', public.money_currencies_in_use()
  );
$function$;

revoke all on function public.admin_finance_overview(timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, text) from public, anon, authenticated;
grant execute on function public.admin_finance_overview(timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, text) to service_role;

drop function if exists public.admin_platform_analytics(timestamp with time zone, timestamp with time zone, text, timestamp with time zone, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.admin_platform_analytics(p_from timestamp with time zone, p_to timestamp with time zone, p_bucket text, p_prev_from timestamp with time zone, p_prev_to timestamp with time zone, p_currency text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_step interval;
  v_result jsonb;
  v_currency text := upper(coalesce(p_currency, public.default_market_currency()::text));
begin
  if p_bucket not in ('hour', 'day', 'week') then
    raise exception 'admin_platform_analytics: unsupported bucket %', p_bucket;
  end if;
  v_step := ('1 ' || p_bucket)::interval;

  with buckets as (
    select gs as bucket_start
    from generate_series(
      date_trunc(p_bucket, p_from),
      p_to - interval '1 microsecond',
      v_step
    ) gs
  ),
  prev_buckets as (
    select gs as bucket_start
    from generate_series(
      date_trunc(p_bucket, p_prev_from),
      p_prev_to - interval '1 microsecond',
      v_step
    ) gs
  ),
  -- One pass per table, bucketed in SQL, then joined onto the full series so
  -- a period with no rows still produces a zero.
  users_by_bucket as (
    select date_trunc(p_bucket, created_at) as b, count(*) as n
    from public.user_info
    where created_at >= p_from and created_at < p_to
    group by 1
  ),
  events_by_bucket as (
    select date_trunc(p_bucket, created_at) as b, count(*) as n
    from public.event
    where created_at >= p_from and created_at < p_to
    group by 1
  ),
  places_by_bucket as (
    select date_trunc(p_bucket, created_at) as b, count(*) as n
    from public.place
    where created_at >= p_from and created_at < p_to
    group by 1
  ),
  tickets_by_bucket as (
    select
      date_trunc(p_bucket, issued_at) as b,
      count(*) filter (where transaction_id is not null and status <> 'cancelled') as paid,
      count(*) filter (where transaction_id is null and status <> 'cancelled')     as free
    from public.ticket
    where issued_at >= p_from and issued_at < p_to
    group by 1
  ),
  money_by_bucket as (
    select
      date_trunc(p_bucket, created_at) as b,
      coalesce(sum(ticket_revenue) filter (where entry_type = 'fee'), 0)  as gross,
      coalesce(sum(service_fee) filter (where entry_type = 'fee'), 0)     as service_fee,
      coalesce(-sum(ticket_revenue) filter (where entry_type = 'fee_refund_adjustment'), 0) as refunded
    from public.platform_fee_entry
    where created_at >= p_from and created_at < p_to
      and currency = v_currency
    group by 1
  ),
  prev_users as (
    select date_trunc(p_bucket, created_at) as b, count(*) as n
    from public.user_info
    where created_at >= p_prev_from and created_at < p_prev_to
    group by 1
  ),
  prev_tickets as (
    select
      date_trunc(p_bucket, issued_at) as b,
      count(*) filter (where transaction_id is not null and status <> 'cancelled') as paid
    from public.ticket
    where issued_at >= p_prev_from and issued_at < p_prev_to
    group by 1
  ),
  prev_money as (
    select
      date_trunc(p_bucket, created_at) as b,
      coalesce(sum(ticket_revenue) filter (where entry_type = 'fee'), 0) as gross
    from public.platform_fee_entry
    where created_at >= p_prev_from and created_at < p_prev_to
      and currency = v_currency
    group by 1
  ),
  series as (
    select jsonb_agg(jsonb_build_object(
      'bucketStart', b.bucket_start,
      'newUsers', coalesce(u.n, 0),
      'newEvents', coalesce(e.n, 0),
      'newPlaces', coalesce(p.n, 0),
      'paidTickets', coalesce(t.paid, 0),
      'freeRegistrations', coalesce(t.free, 0),
      'grossTicketSales', coalesce(m.gross, 0),
      'serviceFeeRevenue', coalesce(m.service_fee, 0),
      'cashRefunded', coalesce(m.refunded, 0)
    ) order by b.bucket_start) as rows
    from buckets b
    left join users_by_bucket u on u.b = b.bucket_start
    left join events_by_bucket e on e.b = b.bucket_start
    left join places_by_bucket p on p.b = b.bucket_start
    left join tickets_by_bucket t on t.b = b.bucket_start
    left join money_by_bucket m on m.b = b.bucket_start
  ),
  previous_series as (
    select jsonb_agg(jsonb_build_object(
      'bucketStart', b.bucket_start,
      'newUsers', coalesce(u.n, 0),
      'paidTickets', coalesce(t.paid, 0),
      'grossTicketSales', coalesce(m.gross, 0)
    ) order by b.bucket_start) as rows
    from prev_buckets b
    left join prev_users u on u.b = b.bucket_start
    left join prev_tickets t on t.b = b.bucket_start
    left join prev_money m on m.b = b.bucket_start
  ),
  -- Tickets say which events people went to; the fee ledger says what was
  -- paid. They are counted separately and joined on the event, because a
  -- basket covering several events has no single event on its fee row.
  top_event_tickets as (
    select ev.id as event_id, count(*) as paid_tickets
    from public.ticket tk
    join public.ticket_type tt on tt.id = tk.ticket_type_id
    join public.event ev on ev.id = tt.event_id
    where tk.issued_at >= p_from and tk.issued_at < p_to
      and tk.transaction_id is not null
      and tk.status <> 'cancelled'
    group by ev.id
  ),
  event_gross as (
    select f.event_id, coalesce(sum(f.ticket_revenue), 0) as gross
    from public.platform_fee_entry f
    where f.entry_type = 'fee'
      and f.created_at >= p_from and f.created_at < p_to
      and f.currency = v_currency
      and f.event_id is not null
    group by f.event_id
  ),
  top_events as (
    select jsonb_agg(x order by x->>'paidTickets' desc) as rows
    from (
      select jsonb_build_object(
        'id', ev.id,
        'title', ev.title,
        'organizerId', ev.organizer_id,
        'organizerName', coalesce(ui.full_name, ui.username, left(ev.organizer_id::text, 8)),
        'paidTickets', t.paid_tickets,
        'grossTicketSales', coalesce(g.gross, 0)
      ) as x
      from top_event_tickets t
      join public.event ev on ev.id = t.event_id
      left join public.user_info ui on ui.id = ev.organizer_id
      left join event_gross g on g.event_id = ev.id
      order by t.paid_tickets desc
      limit 10
    ) s
  ),
  top_organizers as (
    select jsonb_agg(x) as rows
    from (
      select jsonb_build_object(
        'id', ev.organizer_id,
        'name', coalesce(ui.full_name, ui.username, left(ev.organizer_id::text, 8)),
        'grossTicketSales', sum(g.gross),
        'currency', v_currency
      ) as x
      from event_gross g
      join public.event ev on ev.id = g.event_id
      left join public.user_info ui on ui.id = ev.organizer_id
      group by ev.organizer_id, ui.full_name, ui.username
      order by sum(g.gross) desc
      limit 10
    ) s
  )
  select jsonb_build_object(
    'bucket', p_bucket,
    'series', coalesce((select rows from series), '[]'::jsonb),
    'previousSeries', coalesce((select rows from previous_series), '[]'::jsonb),
    'topEvents', coalesce((select rows from top_events), '[]'::jsonb),
    'topOrganizers', coalesce((select rows from top_organizers), '[]'::jsonb),
    -- A basket covering several events cannot be attributed to one of them,
    -- so the per-event tables quietly miss it. Say how much that is.
    'grossWithoutEvent', coalesce((
      select sum(ticket_revenue)
      from public.platform_fee_entry
      where entry_type = 'fee'
        and created_at >= p_from and created_at < p_to
        and currency = v_currency
        and event_id is null
    ), 0),
    'currency', v_currency,
    'currencies', public.money_currencies_in_use()
  )
  into v_result;

  return v_result;
end;
$function$;

revoke all on function public.admin_platform_analytics(timestamp with time zone, timestamp with time zone, text, timestamp with time zone, timestamp with time zone, text) from public, anon, authenticated;
grant execute on function public.admin_platform_analytics(timestamp with time zone, timestamp with time zone, text, timestamp with time zone, timestamp with time zone, text) to service_role;

drop function if exists public.get_organizer_sales_timeline(timestamp with time zone, timestamp with time zone, text);

CREATE OR REPLACE FUNCTION public.get_organizer_sales_timeline(p_start timestamp with time zone, p_end timestamp with time zone, p_bucket text, p_currency text DEFAULT NULL::text)
 RETURNS TABLE(bucket_start timestamp with time zone, gross numeric, orders bigint)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  -- One currency per series: an organizer selling in two markets never sees
  -- cedis and pounds added together. Default: the currency they sell most in.
  v_currency text := upper(coalesce(p_currency, (
    select tt.currency::text
    from public.ticket_checkout tc
    join public.ticket_type tt on tt.id = tc.ticket_type_id
    join public.event e on e.id = tc.event_id
    where e.organizer_id = auth.uid() and tc.status = 'paid'
    group by tt.currency
    order by count(*) filter (
               where (p_start is null or coalesce(tc.completed_at, tc.created_at) >= p_start)
                 and (p_end is null or coalesce(tc.completed_at, tc.created_at) <= p_end)) desc,
             count(*) desc, tt.currency
    limit 1
  ), public.default_market_currency()::text));
BEGIN
  IF p_bucket NOT IN ('hour', 'day', 'month') THEN
    RAISE EXCEPTION 'invalid bucket: %', p_bucket;
  END IF;

  -- Open-ended window: nothing to generate a series between, so return only
  -- the buckets that have data (the original behaviour).
  IF p_start IS NULL OR p_end IS NULL THEN
    RETURN QUERY
    SELECT
      date_trunc(p_bucket, COALESCE(tc.completed_at, tc.created_at)) AS bucket_start,
      COALESCE(SUM(tc.total_price), 0),
      COUNT(*)
    FROM public.ticket_checkout tc
    JOIN public.event e ON e.id = tc.event_id
    JOIN public.ticket_type tt ON tt.id = tc.ticket_type_id
    WHERE e.organizer_id = auth.uid()
      AND tt.currency = v_currency
      AND e.status = 'published'
      AND tc.status = 'paid'
      AND (p_start IS NULL OR COALESCE(tc.completed_at, tc.created_at) >= p_start)
      AND (p_end IS NULL OR COALESCE(tc.completed_at, tc.created_at) <= p_end)
    GROUP BY date_trunc(p_bucket, COALESCE(tc.completed_at, tc.created_at))
    ORDER BY bucket_start;

    RETURN;
  END IF;

  RETURN QUERY
  WITH buckets AS (
    SELECT generate_series(
      date_trunc(p_bucket, p_start),
      date_trunc(p_bucket, p_end),
      ('1 ' || p_bucket)::interval
    ) AS bucket_start
  ),
  sales AS (
    SELECT
      date_trunc(p_bucket, COALESCE(tc.completed_at, tc.created_at)) AS bucket_start,
      COALESCE(SUM(tc.total_price), 0) AS gross,
      COUNT(*) AS orders
    FROM public.ticket_checkout tc
    JOIN public.event e ON e.id = tc.event_id
    JOIN public.ticket_type tt ON tt.id = tc.ticket_type_id
    WHERE e.organizer_id = auth.uid()
      AND tt.currency = v_currency
      AND e.status = 'published'
      AND tc.status = 'paid'
      AND COALESCE(tc.completed_at, tc.created_at) >= p_start
      AND COALESCE(tc.completed_at, tc.created_at) <= p_end
    GROUP BY date_trunc(p_bucket, COALESCE(tc.completed_at, tc.created_at))
  )
  SELECT
    b.bucket_start,
    COALESCE(s.gross, 0)::numeric,
    COALESCE(s.orders, 0)::bigint
  FROM buckets b
  LEFT JOIN sales s ON s.bucket_start = b.bucket_start
  ORDER BY b.bucket_start;
END;
$function$;

revoke all on function public.get_organizer_sales_timeline(timestamp with time zone, timestamp with time zone, text, text) from public, anon;
grant execute on function public.get_organizer_sales_timeline(timestamp with time zone, timestamp with time zone, text, text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_organizer_dashboard_overview(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(currency text, gross_sales numeric, total_discount numeric, distinct_purchasers bigint, paid_orders bigint, tickets_sold bigint, tickets_cancelled bigint, registrations bigint, active_events_count bigint, upcoming_events_count bigint, total_events_count bigint)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  WITH organizer_events AS (
    SELECT e.id, e.starts_at, e.ends_at
    FROM public.event e
    WHERE e.organizer_id = auth.uid() AND e.status = 'published'
  ),
  occurrence_bounds AS (
    SELECT
      oe.id,
      COALESCE(MIN(eo.starts_at), oe.starts_at) AS min_starts,
      COALESCE(MAX(eo.ends_at), oe.ends_at)      AS max_ends
    FROM organizer_events oe
    LEFT JOIN public.event_occurrence eo ON eo.event_id = oe.id
    GROUP BY oe.id, oe.starts_at, oe.ends_at
  ),
  event_status_counts AS (
    SELECT
      COUNT(*) FILTER (
        WHERE min_starts IS NOT NULL AND now() >= min_starts AND now() <= max_ends
      ) AS ongoing_count,
      COUNT(*) FILTER (
        WHERE min_starts IS NOT NULL AND min_starts > now()
      ) AS upcoming_count,
      COUNT(*) AS total_count
    FROM occurrence_bounds
  ),
  paid_checkouts AS (
    SELECT tc.*
    FROM public.ticket_checkout tc
    JOIN organizer_events oe ON oe.id = tc.event_id
    WHERE tc.status = 'paid'
      AND (p_start IS NULL OR COALESCE(tc.completed_at, tc.created_at) >= p_start)
      AND (p_end IS NULL OR COALESCE(tc.completed_at, tc.created_at) <= p_end)
  ),
  money_by_currency AS (
    SELECT
      tt.currency AS currency,
      COALESCE(SUM(pc.total_price), 0) AS gross,
      COALESCE(SUM(pc.discount), 0)    AS discount,
      COUNT(DISTINCT pc.user_id)       AS purchasers,
      COUNT(*)                         AS orders
    FROM paid_checkouts pc
    JOIN public.ticket_type tt ON tt.id = pc.ticket_type_id
    GROUP BY tt.currency
  ),
  money_rows AS (
    SELECT * FROM money_by_currency
    UNION ALL
    SELECT NULL::text, 0::numeric, 0::numeric, 0::bigint, 0::bigint
    WHERE NOT EXISTS (SELECT 1 FROM money_by_currency)
  ),
  organizer_tickets AS (
    SELECT t.*, tt.price
    FROM public.ticket t
    JOIN public.ticket_type tt ON tt.id = t.ticket_type_id
    JOIN organizer_events oe ON oe.id = tt.event_id
  ),
  ticket_counts_overall AS (
    SELECT
      COUNT(*) FILTER (
        WHERE ot.status = 'active' AND ot.price > 0
          AND (p_start IS NULL OR ot.created_at >= p_start)
          AND (p_end IS NULL OR ot.created_at <= p_end)
      ) AS sold,
      COUNT(*) FILTER (
        WHERE ot.status = 'cancelled'
          AND (p_start IS NULL OR ot.updated_at >= p_start)
          AND (p_end IS NULL OR ot.updated_at <= p_end)
      ) AS cancelled,
      COUNT(*) FILTER (
        WHERE ot.status = 'active' AND ot.price = 0
          AND (p_start IS NULL OR ot.created_at >= p_start)
          AND (p_end IS NULL OR ot.created_at <= p_end)
      ) AS registrations
    FROM organizer_tickets ot
  )
  SELECT
    mr.currency,
    mr.gross,
    mr.discount,
    mr.purchasers,
    mr.orders,
    tco.sold,
    tco.cancelled,
    tco.registrations,
    esc.ongoing_count + esc.upcoming_count,
    esc.upcoming_count,
    esc.total_count
  FROM money_rows mr
  CROSS JOIN ticket_counts_overall tco
  CROSS JOIN event_status_counts esc
  ORDER BY mr.orders DESC, mr.currency;
END;
$function$;
