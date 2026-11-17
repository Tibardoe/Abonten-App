-- Card checks are refunded until the money is back (2026-11-17).
--
-- Saving a card charges the buyer a small amount (GH₵1.00) so the provider
-- returns a reusable token, then refunds it at once. That refund was
-- best-effort: when the provider refused it (Paystack: "Insufficient balance
-- to process refund", a new live account's balance is near zero) nothing
-- recorded or retried it, and the buyer kept losing the GH₵1.00 (found on
-- the founder's own card during the live cutover).
--
-- Now every card check is a row in payment_orphan_capture, the table for
-- money taken with no order to issue (source 'card_verification'), and the
-- payment-reconcile sweep asks again for any refund there the provider
-- refused or that was never sent, card checks and late captures alike:
--
--   orphan_refund_retry_candidates(p_limit)  refund_failed or detected,
--     untouched for 30 minutes, fewer than ten tries, seen in the last 14
--     days; one rule for the service (orphanRefundRetryCore) and for the
--     dispatcher's "is there anything to do" check below.
--   run_payment_reconcile_dispatch()  also posts when one is due, and opens
--     fin_reconciliation.orphan_refunds_refused after ten refusals.
-- The refund.processed webhook already settles these rows by reference
-- (markOrphanCaptureRefund).

alter table public.payment_orphan_capture
  drop constraint if exists payment_orphan_capture_source_check;
alter table public.payment_orphan_capture
  add constraint payment_orphan_capture_source_check
  check (source in ('webhook', 'verify', 'reconcile', 'card_verification'));

create index if not exists idx_payment_orphan_capture_refund_due
  on public.payment_orphan_capture (updated_at)
  where status in ('refund_failed', 'detected');

create or replace function public.orphan_refund_retry_candidates(p_limit integer default 5)
returns table (
  id uuid,
  provider text,
  country_code text,
  provider_reference text,
  provider_transaction_id text,
  currency text,
  attempts integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id, o.provider, o.country_code::text, o.provider_reference,
    o.provider_transaction_id, o.currency::text, coalesce(o.attempts, 0)
  from public.payment_orphan_capture o
  where o.status in ('refund_failed', 'detected')
    and o.provider_reference is not null
    and coalesce(o.attempts, 0) < 10
    and coalesce(o.updated_at, o.detected_at) < now() - interval '30 minutes'
    and o.detected_at >= now() - interval '14 days'
  order by coalesce(o.updated_at, o.detected_at)
  limit least(greatest(coalesce(p_limit, 5), 1), 25);
$$;

revoke all on function public.orphan_refund_retry_candidates(integer) from public, anon, authenticated;
grant execute on function public.orphan_refund_retry_candidates(integer) to service_role;

create or replace function public.run_payment_reconcile_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
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

  if exists (
    select 1
    from (
      select r.transaction_id
      from public.transaction_refund r
      where r.status = 'failed'
      group by r.transaction_id
      having count(*) >= 5
    ) refused
    join public.transaction t on t.id = refused.transaction_id
    where t.status = 'successful'
      and coalesce(t.credit_amount, 0) = 0
      and exists (
        select 1 from public.ticket k
        where k.transaction_id = t.id
          and k.status = 'cancelled'
          and k.updated_at >= now() - interval '14 days'
          and not exists (
            select 1
            from public.transaction_refund_ticket rt
            join public.transaction_refund r on r.id = rt.refund_id
            where rt.ticket_id = k.id and r.status <> 'failed'
          )
      )
  ) then
    perform public.open_reconciliation_incident(
      'fin_reconciliation.refunds_refused',
      'Refunds the payment provider keeps refusing',
      'A payment with cancelled tickets has had five refund requests refused. The sweep has stopped asking: open Admin › Finance › Refunds, read the failure, and refund by hand.',
      'high'
    );
  end if;

  -- A charge with no order (a card check, a payment taken after its order
  -- closed) whose refund the provider refused ten times: a person looks.
  if exists (
    select 1
    from public.payment_orphan_capture o
    where o.status = 'refund_failed'
      and o.attempts >= 10
      and o.detected_at >= now() - interval '14 days'
  ) then
    perform public.open_reconciliation_incident(
      'fin_reconciliation.orphan_refunds_refused',
      'Charges with no order the provider will not refund',
      'A card check or a payment taken after its order closed has had ten refund requests refused. The sweep has stopped asking: open Admin › Finance › Refunds › Charges with no order, read the failure, and refund it by hand.',
      'high'
    );
  end if;

  select * into v_cfg from public.payment_reconcile_config where id = true;
  if v_cfg.dispatch_url is null
     or not (
       exists (
         select 1 from public.payment_attempt a
         where a.status in ('initiated', 'pending', 'fulfillment_failed')
           and a.provider_reference is not null
           and a.provider <> 'abonten_credit'
           and a.created_at < now() - interval '35 minutes'
           and a.created_at >= now() - interval '2 days'
           and a.updated_at < now() - interval '30 minutes'
       )
       or exists (select 1 from public.refund_retry_candidates(1))
       or exists (select 1 from public.orphan_refund_retry_candidates(1))
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
$function$;

revoke all on function public.run_payment_reconcile_dispatch() from public, anon, authenticated;
