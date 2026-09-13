-- Admin console metrics, phase 3: platform analytics and honest demographics.
--
-- Two functions, both service_role only:
--
--   admin_platform_analytics()  growth and sales over time, zero-filled, with
--                               the equivalent previous window and the top
--                               events and organizers of the period.
--   admin_user_demographics()   the only breakdowns the data actually
--                               supports, as raw counts. Suppression of small
--                               buckets happens in the service layer
--                               (@abonten/core/admin/smallSample), never here,
--                               so the rule has one implementation and one
--                               set of tests.
--
-- The series used to be built by pulling up to 50,000 raw rows per metric into
-- JavaScript and bucketing them there, which dropped every day that had no
-- activity — a gap in a chart read as "no data" when it meant "zero".
-- generate_series makes the empty days real zeros.
--
-- Definitions match packages/core/src/admin/metricDefinitions.ts and
-- docs/admin/metrics.md; change the three together.

create or replace function public.admin_platform_analytics(
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text,
  p_prev_from timestamptz,
  p_prev_to timestamptz
)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $function$
declare
  v_step interval;
  v_result jsonb;
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
        'currency', coalesce(
          (select currency from public.platform_fee_config where is_active limit 1),
          'GHS')
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
        and event_id is null
    ), 0)
  )
  into v_result;

  return v_result;
end;
$function$;

revoke execute on function public.admin_platform_analytics(timestamptz, timestamptz, text, timestamptz, timestamptz) from public, anon, authenticated;
grant  execute on function public.admin_platform_analytics(timestamptz, timestamptz, text, timestamptz, timestamptz) to service_role;

comment on function public.admin_platform_analytics(timestamptz, timestamptz, text, timestamptz, timestamptz) is
  'Growth and ticket-sales series for the admin Analytics page, zero-filled by generate_series, with the equivalent previous window and the period''s top events and organizers.';

-- ---------------------------------------------------------------------
-- Demographics. Abonten collects no age, gender, home location or language,
-- and keeps no session record — so these are the only breakdowns the data
-- honestly supports. Raw counts only: the caller applies the small-sample
-- rule before anything reaches a screen.
-- ---------------------------------------------------------------------
create or replace function public.admin_user_demographics(
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
  with captured as (
    -- A payment that was later refunded still means someone bought.
    select user_id, created_at
    from public.transaction
    where status in ('successful', 'refund_pending', 'refunded')
  ),
  organizers as (
    select distinct organizer_id as id from public.event where status <> 'draft'
  ),
  owners as (
    select distinct owner_id as id from public.place where owner_id is not null
  ),
  buyers as (select distinct user_id as id from captured)
  select jsonb_build_object(
    'signInMethod', coalesce((
      select jsonb_agg(jsonb_build_object('key', s.k, 'count', s.n) order by s.n desc)
      from (
        select coalesce(au.raw_app_meta_data->>'provider', 'unknown') as k, count(*) as n
        from auth.users au
        join public.user_info ui on ui.id = au.id and ui.status_id <> 4
        group by 1
      ) s
    ), '[]'::jsonb),
    'platform', coalesce((
      select jsonb_agg(jsonb_build_object('key', s.k, 'count', s.n) order by s.n desc)
      from (
        select platform as k, count(distinct user_id) as n
        from public.device_token
        group by 1
      ) s
    ), '[]'::jsonb),
    'platformUsersTotal', (select count(distinct user_id) from public.device_token),
    'accountStatus', coalesce((
      select jsonb_agg(jsonb_build_object('key', s.k, 'count', s.n) order by s.k)
      from (
        select status_id::text as k, count(*) as n
        from public.user_info
        group by 1
      ) s
    ), '[]'::jsonb),
    -- Each person counted once, in the widest role they hold.
    'roles', jsonb_build_array(
      jsonb_build_object('key', 'organizer', 'count', (
        select count(*) from public.user_info u
        where u.status_id = 1 and u.id in (select id from organizers))),
      jsonb_build_object('key', 'placeOwner', 'count', (
        select count(*) from public.user_info u
        where u.status_id = 1
          and u.id in (select id from owners)
          and u.id not in (select id from organizers))),
      jsonb_build_object('key', 'buyer', 'count', (
        select count(*) from public.user_info u
        where u.status_id = 1
          and u.id in (select id from buyers)
          and u.id not in (select id from organizers)
          and u.id not in (select id from owners))),
      jsonb_build_object('key', 'noActivity', 'count', (
        select count(*) from public.user_info u
        where u.status_id = 1
          and u.id not in (select id from organizers)
          and u.id not in (select id from owners)
          and u.id not in (select id from buyers)))
    ),
    'activeUsers', (select count(*) from public.user_info where status_id = 1),
    'buyersAllTime', (select count(*) from buyers),
    'repeatBuyersAllTime', (
      select count(*) from (
        select user_id from captured group by user_id having count(*) >= 2
      ) r
    ),
    'buyersCurrent', (
      select count(distinct user_id) from captured
      where created_at >= p_from and created_at < p_to
    ),
    'buyersPrevious', (
      select count(distinct user_id) from captured
      where created_at >= p_prev_from and created_at < p_prev_to
    ),
    'returningBuyers', (
      select count(*) from (
        select user_id from captured
        where created_at >= p_from and created_at < p_to
        intersect
        select user_id from captured
        where created_at >= p_prev_from and created_at < p_prev_to
      ) r
    )
  );
$function$;

revoke execute on function public.admin_user_demographics(timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant  execute on function public.admin_user_demographics(timestamptz, timestamptz, timestamptz, timestamptz) to service_role;

comment on function public.admin_user_demographics(timestamptz, timestamptz, timestamptz, timestamptz) is
  'Aggregate-only breakdowns the data supports: sign-in method, mobile platform (push-enabled users), account status, role mix and buyer activity. Reads auth.users, so service_role only. Small-sample suppression is applied by @abonten/core/admin/smallSample before display.';
