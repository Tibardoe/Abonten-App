-- Refunds the payment provider refused, or that were never sent, are asked
-- for again on their own (2026-11-16).
--
-- Cancelling Pilot Paid Night refunded its three buyers side by side and
-- Paystack refused two ("A refund is already being processed for this
-- account"). Their tickets were cancelled, refund_mark_outcome marked the
-- parts failed, and nothing asked again: only the buyer's Retry refund or
-- Admin › Finance could. A request that dies between cancelling and
-- refunding (a timeout part-way through a large event) leaves the same
-- state with no part at all.
--
-- refund_retry_candidates() lists cash payments that still owe a refund by
-- the rule refund_prepare itself uses: a `successful` payment, not credit
-- and not a Pay small small plan, with a cancelled ticket no live refund
-- part covers. The payment-reconcile sweep calls issueRefundCore for each,
-- one at a time, which re-runs refund_prepare under its lock, so nothing
-- here decides an amount. Guards:
--   * a ticket cancelled in the last 15 minutes is left to the request
--     that cancelled it; one cancelled over 14 days ago is left to a person;
--   * a payment that had a refund part in the last 30 minutes waits;
--   * after five refused parts it stops and a reconciliation incident
--     (fin_reconciliation.refunds_refused) reaches the super-admins instead.

create index if not exists idx_ticket_cancelled_updated_at
  on public.ticket (updated_at)
  where status = 'cancelled';

create or replace function public.refund_retry_candidates(p_limit integer default 5)
returns table (transaction_id uuid, failed_parts integer)
language sql
stable
security definer
set search_path = ''
as $$
  with owed as (
    select distinct k.transaction_id
    from public.ticket k
    where k.status = 'cancelled'
      and k.transaction_id is not null
      and k.updated_at < now() - interval '15 minutes'
      and k.updated_at >= now() - interval '14 days'
      and not exists (
        select 1
        from public.transaction_refund_ticket rt
        join public.transaction_refund r on r.id = rt.refund_id
        where rt.ticket_id = k.id and r.status <> 'failed'
      )
  ),
  counted as (
    select t.id,
           t.created_at,
           (select count(*)::integer
              from public.transaction_refund r
             where r.transaction_id = t.id and r.status = 'failed') as failed_parts
    from owed o
    join public.transaction t on t.id = o.transaction_id
    where t.status = 'successful'
      and coalesce(t.credit_amount, 0) = 0
      and t.provider is not null
      and t.provider not in ('abonten_plan', 'abonten_credit')
      and t.provider_reference is not null
      and not exists (
        select 1 from public.transaction_refund r
        where r.transaction_id = t.id
          and r.created_at > now() - interval '30 minutes'
      )
  )
  select c.id, c.failed_parts
  from counted c
  where c.failed_parts < 5
  order by c.created_at
  limit greatest(1, least(coalesce(p_limit, 5), 25));
$$;

comment on function public.refund_retry_candidates(integer) is
  'Cash payments that still owe a refund (refund_prepare''s rule) and may be asked again now; read by the payment-reconcile sweep, service role only.';

revoke all on function public.refund_retry_candidates(integer) from public, anon, authenticated;
grant execute on function public.refund_retry_candidates(integer) to service_role;

-- The dispatcher posts to /api/maintenance/payment-reconcile when an open
-- payment attempt OR an owed refund is waiting, and opens one incident for
-- refunds the provider has refused five times.
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
