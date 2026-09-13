-- Admin console metrics, phase 2: one query for the operations dashboard.
--
-- The console used to build this page in JavaScript: a head-count per table,
-- every `event.organizer_id` row pulled into memory to count distinct
-- organizers, and every fee row for the window summed in a loop. Correct at
-- 19 events, wrong-shaped at 19,000 — and there was no way to show a figure
-- against the period before it without doubling the round trips.
--
-- admin_dashboard_kpis() answers the whole page in one round trip: the
-- point-in-time counts, the selected window, the equivalent previous window
-- for comparison, dependency health and the "needs attention" queue.
--
-- Definitions here are the ones in packages/core/src/admin/metricDefinitions.ts
-- and docs/admin/metrics.md; change the three together.
--   * windows are half-open [from, to) so a row is in exactly one of them
--   * a sale is a `fee` row; `fee_refund_adjustment` rows are refunds, and
--     are never netted into gross
--   * a paid ticket has a transaction behind it and is not cancelled; a free
--     registration has none
--   * an organizer has at least one non-draft event
--   * net revenue counts only payments whose Paystack cost was reported —
--     an unknown cost is not a zero cost

create or replace function public.admin_dashboard_kpis(
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
      'refundsPending',  (select count(*) from public.transaction where status = 'refund_pending'),
      'refundsPendingAmount', (
        -- Only the ticket revenue can go back: the service fee is retained.
        -- A pre-fee-model transaction has no fee entry, so fall back to what
        -- was charged rather than reporting nothing refundable.
        select coalesce(sum(coalesce(f.ticket_revenue, tr.amount)), 0)
        from public.transaction tr
        left join public.platform_fee_entry f
          on f.transaction_id = tr.id and f.entry_type = 'fee'
        where tr.status = 'refund_pending'
      ),
      'currency', coalesce(
        (select currency from public.platform_fee_config where is_active limit 1),
        'GHS'
      )
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

revoke execute on function public.admin_dashboard_kpis(timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant  execute on function public.admin_dashboard_kpis(timestamptz, timestamptz, timestamptz, timestamptz) to service_role;

comment on function public.admin_dashboard_kpis(timestamptz, timestamptz, timestamptz, timestamptz) is
  'Operations dashboard in one round trip: point-in-time counts, the selected window, the equivalent previous window, dependency health and the attention queue. Definitions mirror packages/core/src/admin/metricDefinitions.ts.';

-- ---------------------------------------------------------------------
-- payout.status is CHECK-constrained to processing/completed/failed/
-- cancelled (20260819110000). 'pending' and 'requested' cannot exist, so
-- the dashboard's "payouts pending" was really counting 'processing' alone
-- while implying it covered more.
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard_counts()
  returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $function$
  select jsonb_build_object(
    'openReports', (
      select count(*) from public.report
      where status in ('new','under_review','awaiting_info','escalated')
    ),
    'urgentReports', (
      select count(*) from public.report
      where status in ('new','under_review','awaiting_info','escalated')
        and priority = 'urgent'
    ),
    'reportsUnassigned', (
      select count(*) from public.report
      where status in ('new','under_review','awaiting_info','escalated')
        and assigned_to is null
    ),
    'pendingClaims', (
      select count(*) from public.place_claim_request where status = 'pending'
    ),
    'pendingVerifications', (
      select count(*) from public.verification_case where status = 'pending_review'
    ),
    'openErrorGroups', (
      select count(*) from public.app_error_group where status = 'open'
    ),
    'failingHealthChecks', (
      select count(*) from (
        select distinct on (check_key) check_key, ok
        from public.health_check_result
        order by check_key, checked_at desc
      ) latest
      where latest.ok = false
    ),
    'stuckPayments', (
      select count(*) from public.payment_attempt
      where status in ('initiated','pending','processing')
        and created_at < now() - interval '30 minutes'
    ),
    'pendingRefunds', (
      select count(*) from public.transaction where status = 'refund_pending'
    ),
    'pendingPayouts', (
      select count(*) from public.payout where status = 'processing'
    )
  );
$function$;

revoke execute on function public.admin_dashboard_counts() from public, anon, authenticated;
grant  execute on function public.admin_dashboard_counts() to service_role;

-- ---------------------------------------------------------------------
-- Indexes the console's date-bucketed reads need. Every table here is well
-- under 100k rows, so a plain CREATE INDEX is a sub-second lock.
-- ---------------------------------------------------------------------
create index if not exists idx_ticket_issued_at
  on public.ticket (issued_at);
create index if not exists idx_ticket_status_issued_at
  on public.ticket (status, issued_at);
create index if not exists idx_event_created_at
  on public.event (created_at);
create index if not exists idx_event_status_organizer
  on public.event (status, organizer_id);
create index if not exists idx_place_created_at
  on public.place (created_at);
create index if not exists idx_transaction_status_created
  on public.transaction (status, created_at);
create index if not exists idx_platform_fee_entry_type_created
  on public.platform_fee_entry (entry_type, created_at);
create index if not exists idx_organizer_ledger_entry_type_created
  on public.organizer_ledger_entry (entry_type, created_at);

-- ---------------------------------------------------------------------
-- health_check_result grows by ~7,000 rows a day (12 probes every 2
-- minutes) and nothing has ever deleted from it. Only the newest row per
-- check is ever read; a month of history is more than enough to answer
-- "was it failing last week?".
-- ---------------------------------------------------------------------
select cron.unschedule(j.jobname)
from cron.job j
where j.jobname = 'purge-health-check-result';

select cron.schedule(
  'purge-health-check-result',
  '17 3 * * *',
  $$delete from public.health_check_result where checked_at < now() - interval '30 days'$$
);
