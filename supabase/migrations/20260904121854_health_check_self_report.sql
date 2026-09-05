-- Admin Console — make the health cron self-report.
--
-- Problem this fixes: `run_scheduled_health_check()` fires an async
-- `net.http_get` at the deployed /api/observability/health endpoint and
-- returns immediately. If that call is rejected (401 — the deployment's
-- OBSERVABILITY_INGEST_SECRET missing or not matching observability_config)
-- or unreachable, NOTHING is recorded: health_check_result stays empty and
-- the Admin Monitor shows "No health results yet" with no hint why.
--
-- Fix: keep the fire-and-forget dispatch, but on each 2-minute tick first
-- reconcile the PREVIOUS dispatch by reading its row in net._http_response
-- and writing a `check_key = 'self'` health_check_result row from the HTTP
-- status it got back:
--   * 2xx        -> self ok=true   (the endpoint itself then wrote the 8
--                                   real dependency rows)
--   * non-2xx    -> self ok=false  detail = { http_status, body, reason }
--   * no response / connection error / timeout -> self ok=false
--
-- So a broken pipeline is now VISIBLE on the dashboard (self = down, 401)
-- instead of invisible. The 8 real probes still only run once the endpoint
-- accepts the call.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

alter table public.observability_config
  add column if not exists last_request_id    bigint,
  add column if not exists last_dispatched_at timestamptz;

create or replace function public.run_scheduled_health_check()
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_url        text;
  v_secret     text;
  v_prev_id    bigint;
  v_prev_at    timestamptz;
  v_resp       record;
  v_latency_ms integer;
  v_new_id     bigint;
begin
  select health_url, ingest_secret, last_request_id, last_dispatched_at
    into v_url, v_secret, v_prev_id, v_prev_at
  from public.observability_config
  where id = true;

  if v_url is null or v_secret is null then
    return; -- not configured yet
  end if;

  -- ── reconcile the previous dispatch ───────────────────────────────
  if v_prev_id is not null then
    select status_code, error_msg, timed_out, content, created
      into v_resp
    from net._http_response
    where id = v_prev_id;

    if found then
      v_latency_ms := greatest(
        0,
        floor(extract(epoch from (v_resp.created - coalesce(v_prev_at, v_resp.created))) * 1000)
      )::int;

      if v_resp.status_code between 200 and 299 then
        insert into public.health_check_result (check_key, ok, latency_ms, detail)
        values ('self', true, v_latency_ms,
                jsonb_build_object('http_status', v_resp.status_code));
      else
        insert into public.health_check_result (check_key, ok, latency_ms, detail)
        values ('self', false, v_latency_ms, jsonb_build_object(
          'http_status', v_resp.status_code,
          'timed_out',   coalesce(v_resp.timed_out, false),
          'error',       v_resp.error_msg,
          'body',        left(coalesce(v_resp.content, ''), 500),
          'reason', case
            when coalesce(v_resp.timed_out, false) then 'health endpoint timed out'
            when v_resp.status_code = 401 then 'health endpoint rejected the shared secret (check OBSERVABILITY_INGEST_SECRET on the web deployment)'
            when v_resp.status_code is null then 'health endpoint unreachable'
            else 'health endpoint returned a non-2xx status'
          end));
      end if;
    elsif v_prev_at is not null and v_prev_at < (now() - interval '110 seconds') then
      -- dispatched over a tick ago and still no response row: lost.
      insert into public.health_check_result (check_key, ok, latency_ms, detail)
      values ('self', false, null, jsonb_build_object(
        'reason', 'no response from health endpoint (timeout or network failure)'));
    end if;
  end if;

  -- ── dispatch a fresh probe ────────────────────────────────────────
  select net.http_get(
    url     := v_url,
    headers := jsonb_build_object('x-observability-secret', v_secret)
  ) into v_new_id;

  update public.observability_config
     set last_request_id    = v_new_id,
         last_dispatched_at  = now()
   where id = true;
end;
$function$;

revoke execute on function public.run_scheduled_health_check() from public, anon, authenticated;
grant execute on function public.run_scheduled_health_check() to service_role;
