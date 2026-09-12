-- The job rows could never record how long a run took.
--
-- `fieldops_job_run.started_at` defaults to now() and the sweep stamps
-- `finished_at = now()` -- but now() is TRANSACTION time in Postgres, so
-- both resolve to the same instant and every run reports a duration of
-- zero. That makes the one number anyone would look at to spot a sweep
-- slowing down permanently useless, and it hid the fact during the 5,000-row
-- load check (the run was really seconds, the row said 0.000).
--
-- clock_timestamp() is wall-clock and advances inside a transaction, which
-- is exactly what a duration needs.

alter table public.fieldops_job_run
  alter column started_at set default clock_timestamp();

-- Rather than restating two large job functions to change one word each,
-- the table itself insists on wall-clock time. This row exists only to
-- record how long a job took, so there is no case where a caller would
-- legitimately want transaction time here -- and any job added later gets
-- the same guarantee for free.
create function public.fieldops_job_run_wall_clock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.started_at := clock_timestamp();
  elsif new.finished_at is not null
        and new.finished_at is distinct from old.finished_at then
    new.finished_at := clock_timestamp();
  end if;
  return new;
end;
$$;

revoke execute on function public.fieldops_job_run_wall_clock() from public, anon, authenticated;

create trigger fieldops_job_run_wall_clock_stamp
  before insert or update on public.fieldops_job_run
  for each row execute function public.fieldops_job_run_wall_clock();

create or replace function public.fieldops_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', coalesce((select s.program_enabled from public.fieldops_program_setting s where s.id = 1), false),
    'sweep_lag_seconds', coalesce((
      select extract(epoch from clock_timestamp() - max(j.finished_at))::integer
      from public.fieldops_job_run j where j.job = 'eligibility_sweep' and j.finished_at is not null), 0),
    'sweep_seconds', coalesce((
      select round(extract(epoch from (j.finished_at - j.started_at))::numeric, 3)
      from public.fieldops_job_run j
      where j.job = 'eligibility_sweep' and j.finished_at is not null
      order by j.started_at desc limit 1), 0),
    'sweep_failures', coalesce((
      select j.failed from public.fieldops_job_run j
      where j.job = 'eligibility_sweep' and j.finished_at is not null
      order by j.started_at desc limit 1), 0),
    'due_not_swept', (
      select count(*) from public.fieldops_onboarding ob
      join public.fieldops_campaign c on c.id = ob.campaign_id
      left join public.fieldops_commission_rule r on r.id = ob.rule_id
      left join public.event e on e.id = ob.event_id
      left join public.place_claim_request cr on cr.id = ob.claim_request_id
      where ob.status = 'verified' and ob.holding_until < now() - interval '1 hour'
        and c.status in ('active', 'winding_down', 'completed')
        and not (ob.flags && array['budget_exhausted'])
        and case coalesce(r.eligibility ->> 'release_policy', 'holding_period')
              when 'event_started'  then e.starts_at is not null and e.starts_at <= now()
              when 'claim_approved' then cr.id is null or cr.status <> 'pending'
              else true
            end),
    'waiting_on_release', (
      select count(*) from public.fieldops_onboarding ob
      join public.fieldops_commission_rule r on r.id = ob.rule_id
      left join public.event e on e.id = ob.event_id
      left join public.place_claim_request cr on cr.id = ob.claim_request_id
      where ob.status = 'verified'
        and case coalesce(r.eligibility ->> 'release_policy', 'holding_period')
              when 'event_started'  then e.starts_at is null or e.starts_at > now()
              when 'claim_approved' then cr.status = 'pending'
              else false
            end),
    'stuck_reviews', (
      select count(*) from public.fieldops_onboarding
      where status = 'submitted' and submitted_at < now() - interval '3 days'),
    'stale_flags', (
      select count(*) from public.fieldops_onboarding
      where status = 'flagged' and updated_at < now() - interval '7 days'),
    'succeeded_without_commission', (
      select count(*) from public.fieldops_onboarding ob
      where ob.status = 'succeeded'
        and not exists (select 1 from public.fieldops_commission c
                        where c.onboarding_id = ob.id and c.reverses_commission_id is null)),
    'approved_without_rule', (
      select count(*) from public.fieldops_commission
      where status in ('approved', 'in_payout', 'paid')
        and reverses_commission_id is null and rule_id is null),
    'pending_minor', coalesce((
      select sum(amount_minor) from public.fieldops_commission where status = 'pending'), 0),
    'approved_minor', coalesce((
      select sum(amount_minor) from public.fieldops_commission where status = 'approved'), 0),
    'paid_minor', coalesce((
      select sum(amount_minor) from public.fieldops_payout_item where status = 'paid'), 0),
    'payout_drift_minor', coalesce((
      select sum(c.amount_minor)
      from public.fieldops_commission c
      join public.fieldops_payout_item i on i.id = c.payout_item_id
      where i.status = 'paid' and c.reverses_commission_id is null), 0)
      - coalesce((
      select sum(amount_minor) from public.fieldops_payout_item where status = 'paid'), 0),
    'stuck_in_payout', (
      select count(*) from public.fieldops_commission c
      where c.status = 'in_payout'
        and (c.payout_item_id is null
             or not exists (select 1 from public.fieldops_payout_batch b
                            join public.fieldops_payout_item i on i.batch_id = b.id
                            where i.id = c.payout_item_id and b.status in ('draft', 'approved'))))
  );
$$;

revoke all on function public.fieldops_health() from public, anon, authenticated;
grant execute on function public.fieldops_health() to service_role;


-- Rollback: drop the trigger and its function, restore the now() default,
-- and restore fieldops_health to its 20260912003951 definition.
