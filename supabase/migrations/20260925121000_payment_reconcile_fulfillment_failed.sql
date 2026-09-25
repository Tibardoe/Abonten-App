-- Live Paystack cutover, final verification (2026-09-25): the reconcile
-- sweep also retries a charge that was recorded but never issued.
--
-- A payment_attempt in 'fulfillment_failed' has its transaction (the money
-- is taken) but no ticket or promotion — the QR upload or the email step
-- failed after verification. Only the buyer's Retry button reached it, and
-- neither the sweep nor the health check counted it. The dispatch now also
-- fires while such an attempt exists (the route retries it through
-- finalizePayment, which reuses the recorded transaction and never charges
-- again, at most once every 30 minutes per attempt).

create or replace function public.run_payment_reconcile_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg public.payment_reconcile_config;
begin
  update public.payment_attempt a
  set status         = 'cancelled',
      failure_reason = coalesce(a.failure_reason, 'Never reached the payment provider'),
      updated_at     = now()
  where a.status = 'initiated'
    and a.provider_reference is null
    and a.provider <> 'abonten_credit'
    and a.created_at < now() - interval '1 hour'
    and a.created_at >= now() - interval '7 days'
    and not exists (
      select 1 from public.payment_attempt g
      where a.payment_group_id is not null
        and g.payment_group_id = a.payment_group_id
        and g.provider_reference is not null
    );

  select * into v_cfg from public.payment_reconcile_config where id = true;
  if v_cfg.dispatch_url is null
     or not exists (
       select 1 from public.payment_attempt a
       where a.status in ('initiated', 'pending', 'fulfillment_failed')
         and a.provider_reference is not null
         and a.provider <> 'abonten_credit'
         and a.created_at < now() - interval '35 minutes'
         and a.created_at >= now() - interval '2 days'
         and a.updated_at < now() - interval '30 minutes'
     ) then
    return;
  end if;

  perform net.http_post(
    url                  := v_cfg.dispatch_url,
    body                 := '{}'::jsonb,
    headers              := jsonb_build_object('Content-Type', 'application/json',
                                               'x-reconcile-token', v_cfg.token),
    timeout_milliseconds := 55000
  );

  update public.payment_reconcile_config
  set last_dispatched_at = now()
  where id = true;
end;
$$;

revoke all on function public.run_payment_reconcile_dispatch() from public, anon, authenticated;
