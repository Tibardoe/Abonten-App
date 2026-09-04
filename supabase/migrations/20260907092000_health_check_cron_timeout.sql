-- Admin Console — health cron: raise the HTTP timeout, hand the "ok"
-- signal to the endpoint.
--
-- After OBSERVABILITY_INGEST_SECRET was set correctly the endpoint began
-- answering 200, but /api/observability/health runs 8 sequential probes
-- (several are outbound HTTP with their own multi-second ceilings) and
-- sometimes takes longer than pg_net's default 5 s client timeout. When
-- that happened net._http_response recorded status_code = NULL and the
-- reconcile step wrote a bogus `self = down (unreachable)` row even though
-- the endpoint had completed and written its 8 real rows.
--
-- Fix:
--   1. net.http_get now waits 20 s (cron runs every 120 s, so this is safe).
--   2. runHealthChecksCore also writes its own `check_key = 'self',
--      ok = true` row when it finishes, so Endpoint reachability is green
--      the moment the function completes even if our HTTP client gave up.
--   3. A NULL/timeout response is only treated as a failure if there are
--      NO fresh non-`self` health rows from that dispatch window — i.e.
--      the endpoint genuinely did not run, vs. our client giving up early.
--      This is what stops the two `self` writers racing: the cron only
--      writes `self = ok` on a clean 2xx, and `self = down` only when the
--      endpoint verifiably did not run.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

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
  v_endpoint_ran boolean;
  v_new_id     bigint;
begin
  select health_url, ingest_secret, last_request_id, last_dispatched_at
    into v_url, v_secret, v_prev_id, v_prev_at
  from public.observability_config
  where id = true;

  if v_url is null or v_secret is null then
    return; -- not configured yet
  end if;

  -- ── reconcile the previous dispatch (failure rows only) ───────────
  if v_prev_id is not null then
    select status_code, error_msg, timed_out, content, created
      into v_resp
    from net._http_response
    where id = v_prev_id;

    -- did the endpoint clearly run for that dispatch? (it writes its 8
    -- dependency rows synchronously, a few seconds after we call it)
    v_endpoint_ran := v_prev_at is not null and exists (
      select 1 from public.health_check_result
      where check_key <> 'self'
        and checked_at between v_prev_at and (v_prev_at + interval '30 seconds')
    );

    if found and v_resp.status_code between 200 and 299 then
      insert into public.health_check_result (check_key, ok, latency_ms, detail)
      values ('self', true,
              greatest(0, floor(extract(epoch from (v_resp.created - coalesce(v_prev_at, v_resp.created))) * 1000))::int,
              jsonb_build_object('http_status', v_resp.status_code, 'source', 'cron'));

    elsif found and v_resp.status_code is not null then
      -- explicit non-2xx — a real endpoint-side rejection/error
      insert into public.health_check_result (check_key, ok, latency_ms, detail)
      values ('self', false, null, jsonb_build_object(
        'http_status', v_resp.status_code,
        'body',        left(coalesce(v_resp.content, ''), 500),
        'reason', case
          when v_resp.status_code = 401 then 'health endpoint rejected the shared secret (check OBSERVABILITY_INGEST_SECRET on the web deployment)'
          when v_resp.status_code between 500 and 599 then 'health endpoint returned HTTP ' || v_resp.status_code
          else 'health endpoint returned a non-2xx status (' || v_resp.status_code || ')'
        end));

    elsif not v_endpoint_ran then
      -- blank/timed-out response AND no sign the endpoint ran = genuinely
      -- unreachable. If it DID run, our client just gave up early — not a
      -- failure, so record nothing and let the endpoint's own row stand.
      if v_prev_at is null or v_prev_at < (now() - interval '110 seconds') or found then
        insert into public.health_check_result (check_key, ok, latency_ms, detail)
        values ('self', false, null, jsonb_build_object(
          'timed_out', coalesce(v_resp.timed_out, false),
          'error',     nullif(coalesce(v_resp.error_msg, ''), ''),
          'reason', case
            when coalesce(v_resp.timed_out, false)
              or coalesce(v_resp.error_msg, '') ilike '%timeout%'
              then 'no response from health endpoint within the timeout'
            else 'health endpoint unreachable (no response / connection error)'
          end));
      end if;
    end if;
  end if;

  -- ── dispatch a fresh probe (20 s ceiling) ────────────────────────
  select net.http_get(
    url                  := v_url,
    headers              := jsonb_build_object('x-observability-secret', v_secret),
    timeout_milliseconds := 20000
  ) into v_new_id;

  update public.observability_config
     set last_request_id    = v_new_id,
         last_dispatched_at  = now()
   where id = true;
end;
$function$;

revoke execute on function public.run_scheduled_health_check() from public, anon, authenticated;
grant execute on function public.run_scheduled_health_check() to service_role;
