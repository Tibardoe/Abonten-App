-- Admin Console Phase 1 — read-side helpers for the Admin queues/dashboard.
--
--  * admin_report_group  — one row per reported target, with counts, so the
--    Reports queue can show "this event has 17 reports" without pulling
--    every individual report (spec §20). service_role only.
--  * admin_dashboard_counts() — every "Needs attention" number in a single
--    round trip, real aggregates over the live business tables (spec §9/§50).
--    SECURITY DEFINER, service_role only.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

create view public.admin_report_group as
  select
    r.dedupe_key,
    r.target_type,
    r.target_id,
    count(*)                                              as report_count,
    count(*) filter (
      where r.status in ('new','under_review','awaiting_info','escalated')
    )                                                    as open_count,
    max(r.created_at)                                     as latest_created_at,
    array_agg(distinct r.category)                        as categories,
    max(
      case r.priority
        when 'urgent' then 4 when 'high' then 3
        when 'normal' then 2 else 1
      end
    )                                                    as priority_rank
  from public.report r
  group by r.dedupe_key, r.target_type, r.target_id;

revoke all on public.admin_report_group from anon, authenticated;
grant select on public.admin_report_group to service_role;

create function public.admin_dashboard_counts()
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
      select count(*) from public.payout
      where status in ('pending','processing','requested')
    )
  );
$function$;

revoke execute on function public.admin_dashboard_counts() from public, anon, authenticated;
grant execute on function public.admin_dashboard_counts() to service_role;
