-- Phase 2 (REL-001, DATA-001): recover stuck payment_attempts, and stop the
-- checkout-expiry sweep from restocking inventory out from under a payment
-- that's still in flight.

-- REL-001 -------------------------------------------------------------
-- A payment_attempt can be left in 'processing' forever if the caller
-- crashes/times out between the CAS lock in finalizePaystackPayment and it
-- returning — 'processing' was never in any re-entry filter, so nothing
-- could pick it back up automatically. finalizePaystackPayment now
-- self-heals this on its own next call (see STUCK_PROCESSING_MINUTES), but
-- that only fires if something calls it again. This cron is the systemic
-- backstop for an attempt nobody retries on their own.
create or replace function public.recover_stale_payment_attempts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payment_attempt
  set
    status = case when transaction_id is not null then 'fulfillment_failed' else 'pending' end,
    failure_reason = coalesce(failure_reason, 'Recovered from a stuck processing state'),
    updated_at = now()
  where status = 'processing'
    and updated_at < now() - interval '15 minutes';
end;
$$;

revoke execute on function public.recover_stale_payment_attempts()
  from public, anon, authenticated;
grant execute on function public.recover_stale_payment_attempts() to service_role;

select cron.schedule(
  'recover-stale-payment-attempts',
  '*/5 * * * *',
  $$select public.recover_stale_payment_attempts();$$
);

-- DATA-001 --------------------------------------------------------------
-- expire_stale_ticket_checkouts now leaves alone any checkout that has a
-- payment_attempt still in flight (initiated/pending/processing). Without
-- this, a slow mobile-money authorisation that outlives the 30-minute
-- checkout window got its seats restocked while Paystack was still working
-- on the charge — the eventual successful webhook then either issued
-- tickets against an 'expired' checkout (buyer charged, no ticket) or, if
-- the seats were resold in between, drove inventory negative.
create or replace function public.expire_stale_ticket_checkouts()
returns setof ticket_checkout
language sql
set search_path to ''
as $function$
  with claimed as (
    update public.ticket_checkout
    set status = 'expired'
    where status = 'pending'
      and expires_at is not null
      and expires_at < now() - interval '1 minute'
      and not exists (
        select 1 from public.payment_attempt pa
        where pa.checkout_session_id = ticket_checkout.checkout_session_id
          and pa.status in ('initiated', 'pending', 'processing')
      )
    returning *
  ),
  restock as (
    update public.ticket_type tt
    set quantity = tt.quantity + sums.total_quantity
    from (
      select ticket_type_id, sum(quantity) as total_quantity
      from claimed
      group by ticket_type_id
    ) sums
    where tt.id = sums.ticket_type_id
      and tt.quantity is not null
    returning tt.id
  ),
  promo_restore as (
    update public.promo_code pc
    set times_used = greatest(0, pc.times_used - sums.total_discounted)
    from (
      select promo_code, sum(discounted_units) as total_discounted
      from claimed
      where promo_code is not null and discounted_units > 0
      group by promo_code
    ) sums
    where pc.promo_code = sums.promo_code
    returning pc.id
  ),
  usage_delete as (
    delete from public.promo_code_usage pcu
    using claimed c
    join public.promo_code pc on pc.promo_code = c.promo_code
    where c.promo_code is not null
      and c.discounted_units > 0
      and pcu.promo_code_id = pc.id
      and pcu.user_id = c.user_id
      and pcu.event_id = c.event_id
    returning pcu.promo_code_id
  )
  select * from claimed;
$function$;
