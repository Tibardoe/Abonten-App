-- Audit 2026-09-26: nobody was told when production was unhealthy.
--
-- Failed health checks and incidents appeared only on Admin › Monitoring.
-- The Abonten Weekly check sat red from 2026-09-21 08:58 UTC for five days
-- without anyone seeing it. Now:
--
--   * health_escalate_failing(keys, runs): a check whose last `runs` results
--     all failed opens an incident (component 'health.<key>', high) through
--     open_reconciliation_incident, which never duplicates an open one. The
--     health endpoint calls it after every run with the keys it just wrote,
--     reading each key's newest rows through idx_health_check_result_key.
--   * incident.alerted_at + incident_alert_claim / incident_alert_release:
--     the endpoint emails every new open incident (health, reconciliation,
--     rewards, promotions — anything that opens one) to the active
--     super-admins (incident_alert_recipients), once. A failed send is
--     released and retried on the next run.
--
-- Existing incidents are marked alerted so history is not emailed (there
-- are none in production today). All four functions are service-role only.

alter table public.incident add column if not exists alerted_at timestamptz;
update public.incident set alerted_at = coalesce(alerted_at, now()) where alerted_at is null;

create or replace function public.health_escalate_failing(p_keys text[], p_runs integer default 3)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r        record;
  v_opened integer := 0;
begin
  for r in
    select k.key, x.n, x.all_down, x.latest_detail
    from unnest(coalesce(p_keys, '{}')) as k(key)
    cross join lateral (
      select count(*) as n,
             coalesce(bool_and(not h.ok), false) as all_down,
             (array_agg(h.detail order by h.checked_at desc))[1] as latest_detail
      from (select hc.ok, hc.detail, hc.checked_at
            from public.health_check_result hc
            where hc.check_key = k.key
            order by hc.checked_at desc
            limit greatest(p_runs, 1)) h
    ) x
  loop
    if r.all_down and r.n >= greatest(p_runs, 1)
       and not exists (select 1 from public.incident i
                       where i.component = 'health.' || r.key and i.status <> 'resolved') then
      perform public.open_reconciliation_incident(
        'health.' || r.key,
        format('Health check "%s" is down', r.key),
        format('The %s check failed %s runs in a row (about %s minutes). Latest detail: %s',
               r.key, r.n, r.n * 2, left(coalesce(r.latest_detail::text, 'none'), 600)),
        'high');
      v_opened := v_opened + 1;
    end if;
  end loop;
  return v_opened;
end;
$$;

create or replace function public.incident_alert_claim(p_limit integer default 20)
returns table (id uuid, title text, severity text, component text, summary text, started_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  update public.incident i
  set alerted_at = now()
  where i.id in (
    select x.id from public.incident x
    where x.alerted_at is null and x.status <> 'resolved'
    order by x.started_at
    limit least(greatest(p_limit, 1), 100)
    for update skip locked)
  returning i.id, i.title, i.severity, i.component, i.summary, i.started_at;
$$;

create or replace function public.incident_alert_release(p_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.incident i set alerted_at = null where i.id = any (p_ids);
$$;

-- Active super-admins' sign-in emails: the people who can act on an incident.
create or replace function public.incident_alert_recipients()
returns table (email text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct u.email::text
  from public.admin_user au
  join public.admin_user_role r on r.user_id = au.user_id and r.role_key = 'super_admin'
  join auth.users u on u.id = au.user_id
  where au.status = 'active' and au.disabled_at is null and u.email is not null;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.health_escalate_failing(text[], integer)',
    'public.incident_alert_claim(integer)',
    'public.incident_alert_release(uuid[])',
    'public.incident_alert_recipients()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
