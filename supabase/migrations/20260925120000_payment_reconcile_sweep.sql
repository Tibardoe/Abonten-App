-- Live Paystack cutover (2026-09-25): a payment the provider completed can
-- no longer be lost between the buyer's app and the webhook.
--
-- A payment settles when the buyer's app verifies it or the provider's
-- webhook arrives. If both are lost, the attempt stays 'initiated' for
-- ever: the buyer is charged with no ticket, and the checkout keeps its
-- tickets reserved (expire_stale_ticket_checkouts skips a checkout while an
-- attempt on it is open). Production held two such charges from August
-- 2026 (Paystack test mode: "success" at Paystack, 'initiated' here).
--
-- 1. payment-reconcile (every 5 minutes):
--    * an attempt that never reached the provider (no reference) an hour
--      after it was made is cancelled, unless another attempt of its group
--      was charged (only a group's primary attempt carries the reference);
--      its checkout is then released by the usual expiry job;
--    * while an attempt with a reference is still open past the checkout
--      hold (35 minutes) and less than two days old, the job posts to
--      /api/maintenance/payment-reconcile, which runs it through
--      finalizePayment (verify with the provider, then fulfil, fail or
--      refund — the same path as the app and the webhook).
--    Older attempts are left alone (the two from August are among them):
--    they are counted by the health check for a person to look at.
-- 2. payment_webhook_event.reference: the provider reference each delivery
--    was about, so "what did the provider tell us about this payment" is
--    one query.

create table public.payment_reconcile_config (
  id                 boolean primary key default true check (id),
  dispatch_url       text,
  token              text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  last_dispatched_at timestamptz,
  updated_at         timestamptz not null default now()
);

comment on table public.payment_reconcile_config is
  'Where the payment-reconcile cron posts and the token it sends (x-reconcile-token). Service role reads the token to check the header.';

-- The URL sits next to the notification one; derive it when that is set
-- (production), otherwise NULL (nothing is dispatched).
insert into public.payment_reconcile_config (id, dispatch_url)
select true,
       case
         when c.dispatch_url ~ '/api/notifications/deliver$'
           then regexp_replace(c.dispatch_url, '/api/notifications/deliver$', '/api/maintenance/payment-reconcile')
         else null
       end
from public.notification_delivery_config c
where c.id = true
on conflict (id) do nothing;

insert into public.payment_reconcile_config (id) values (true)
on conflict (id) do nothing;

alter table public.payment_reconcile_config enable row level security;
revoke all on table public.payment_reconcile_config from public, anon, authenticated;
grant select on table public.payment_reconcile_config to service_role;

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
       where a.status in ('initiated', 'pending')
         and a.provider_reference is not null
         and a.provider <> 'abonten_credit'
         and a.created_at < now() - interval '35 minutes'
         and a.created_at >= now() - interval '2 days'
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

select cron.schedule('payment-reconcile', '*/5 * * * *',
  $cron$select public.run_payment_reconcile_dispatch();$cron$);

alter table public.payment_webhook_event add column reference text;
create index payment_webhook_event_reference_idx
  on public.payment_webhook_event (provider, reference)
  where reference is not null;
