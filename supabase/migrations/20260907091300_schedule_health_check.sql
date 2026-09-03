-- Admin Console Phase 1 — schedule the dependency health probe.
--
-- The Admin "Monitoring" module reads health_check_result rows. Those rows
-- are produced by GET /api/observability/health on the deployed web app,
-- which runs REAL probes (DB, auth, storage, Paystack, Resend, Hubtel,
-- Cloudinary, Expo push). This migration wires pg_cron to call that
-- endpoint every 2 minutes.
--
-- The deployed URL + shared secret are NOT known at migration time and must
-- not live in the repo, so they go in a one-row config table that an
-- operator fills in after the first deploy:
--
--   insert into public.observability_config (health_url, ingest_secret)
--   values ('https://<web-app-host>/api/observability/health', '<OBSERVABILITY_INGEST_SECRET>')
--   on conflict (id) do update
--     set health_url = excluded.health_url,
--         ingest_secret = excluded.ingest_secret,
--         updated_at = now();
--
-- Until that row exists the cron job is a no-op (it does nothing rather
-- than erroring), and the Monitoring dashboard honestly shows "no health
-- results yet".
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

create table public.observability_config (
  id            boolean primary key default true check (id),
  health_url    text,
  ingest_secret text,
  updated_at    timestamptz not null default now()
);

revoke all on public.observability_config from anon, authenticated;
grant all on public.observability_config to service_role;
alter table public.observability_config enable row level security;

create function public.run_scheduled_health_check()
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_url    text;
  v_secret text;
begin
  select health_url, ingest_secret into v_url, v_secret
  from public.observability_config
  where id = true;

  if v_url is null or v_secret is null then
    return; -- not configured yet
  end if;

  perform net.http_get(
    url     := v_url,
    headers := jsonb_build_object('x-observability-secret', v_secret)
  );
end;
$function$;

revoke execute on function public.run_scheduled_health_check() from public, anon, authenticated;
grant execute on function public.run_scheduled_health_check() to service_role;

select cron.schedule(
  'abonten-health-check',
  '*/2 * * * *',
  $$ select public.run_scheduled_health_check() $$
);
