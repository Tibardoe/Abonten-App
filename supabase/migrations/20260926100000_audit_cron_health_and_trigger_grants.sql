-- Audit 2026-09-26.
--
-- 1. Scheduled-job failures were invisible. Admin › Monitoring had no row
--    for pg_cron itself, so a job that started failing (the 2026-09-13
--    storage purge failed nightly for days) showed up only when its effect
--    did. `cron_health()` reports the jobs whose most recent run failed and
--    any run stuck in "running"; the health endpoint turns it into a `cron`
--    check every 2 minutes. It reads only the newest 5,000 runs through the
--    primary key (about 17 hours at today's schedule), so it stays cheap as
--    the history grows.
--
-- 2. `cron.job_run_details` was never trimmed: 190,604 rows (43 MB) since
--    February 2025, about 7,000 more a day, on a database the free plan caps
--    at 500 MB. A daily job keeps 14 days, enough to investigate any
--    incident the health check raises.
--
-- 3. Seven trigger functions were executable by `anon` and `authenticated`
--    (the schema-wide default grant). A trigger function cannot be called
--    through the Data API, and Postgres checks EXECUTE on it only when the
--    trigger is created, never when it fires, so revoking changes nothing
--    for the triggers and removes the advisor findings.

create or replace function public.cron_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with recent as (
    select d.runid, d.jobid, d.status, d.start_time, d.end_time, d.return_message
    from cron.job_run_details d
    where d.runid > coalesce((select max(x.runid) from cron.job_run_details x), 0) - 5000
  ), latest as (
    select distinct on (r.jobid) r.jobid, r.status, r.start_time, r.return_message
    from recent r
    order by r.jobid, r.runid desc
  )
  select jsonb_build_object(
    'jobs_active', (select count(*) from cron.job j where j.active),
    'failing_jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'job', j.jobname,
               'at', l.start_time,
               'message', left(coalesce(l.return_message, ''), 200))
             order by j.jobname)
      from latest l join cron.job j on j.jobid = l.jobid
      where l.status = 'failed' and j.active), '[]'::jsonb),
    'failed_last_hour', (
      select count(*) from recent r
      where r.status = 'failed' and r.start_time > now() - interval '1 hour'),
    'stuck_runs', (
      select count(*) from recent r
      where r.status in ('running', 'starting')
        and r.start_time < now() - interval '30 minutes')
  );
$$;

revoke all on function public.cron_health() from public, anon, authenticated;
grant execute on function public.cron_health() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-cron-run-details') then
    perform cron.unschedule('purge-cron-run-details');
  end if;
end;
$$;

select cron.schedule(
  'purge-cron-run-details',
  '41 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '14 days'$$
);

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.enforce_event_capacity()',
    'public.guard_attendance_client_update()',
    'public.guard_listing_market_columns()',
    'public.guard_place_booking_client_write()',
    'public.guard_promo_code_free_event()',
    'public.guard_ticket_client_update()',
    'public.ticket_type_price_precision()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
  end loop;
end;
$$;
