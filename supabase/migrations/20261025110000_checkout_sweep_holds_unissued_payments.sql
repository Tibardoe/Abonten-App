-- A paid checkout whose ticket issuance failed keeps its seats (2026-10-25).
--
-- When the money is taken but issuing the tickets fails (a QR upload or the
-- issuance call), the payment attempt is 'fulfillment_failed' and the
-- reconcile sweep retries it through finalizePayment every 30 minutes for
-- two days (migration payment_reconcile_fulfillment_failed). The expiry
-- sweep below only spared checkouts with an 'initiated', 'pending' or
-- 'processing' attempt, so it expired such a checkout as soon as its
-- 30-minute hold ran out and put the seats back on sale. The retry then
-- found an expired checkout and could not issue: the buyer had paid and got
-- no ticket. Until the same day, generateTicket's failure path had also
-- restocked the seats itself, so they were counted back twice.
--
-- Now a checkout is also spared while an attempt for it is
-- 'fulfillment_failed' and less than seven days old: the reconcile sweep
-- retries it for two days, the buyer's Retry button and an engineer's retry
-- work while the checkout is still pending, and the "unsettled payments"
-- health check keeps raising it for seven days (finance runbook: retry,
-- never issue by hand). After seven days the sweep releases the seats once,
-- like any other lapsed checkout, and the charge is finance's to settle.
-- Otherwise the body is unchanged from migration scope_promo_release_to_event;
-- create or replace keeps the function's grants.

create or replace function public.expire_stale_ticket_checkouts()
returns setof public.ticket_checkout
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.ticket_checkout
    set status = 'expired'
    where status = 'pending'
      and expires_at is not null
      and expires_at < now() - interval '1 minute'
      and not exists (
        select 1 from public.payment_attempt pa
        where pa.checkout_session_id = ticket_checkout.checkout_session_id
          and (
            pa.status in ('initiated', 'pending', 'processing')
            or (pa.status = 'fulfillment_failed'
                and pa.created_at > now() - interval '7 days')
          )
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
      select
        event_id,
        upper(btrim(promo_code)) as normalized_code,
        sum(discounted_units) as total_discounted
      from claimed
      where promo_code is not null and discounted_units > 0
      group by event_id, upper(btrim(promo_code))
    ) sums
    where pc.event_id = sums.event_id
      and upper(btrim(pc.promo_code)) = sums.normalized_code
    returning pc.id
  ),
  usage_delete as (
    delete from public.promo_code_usage pcu
    using claimed c
    join public.promo_code pc
      on pc.event_id = c.event_id
     and upper(btrim(pc.promo_code)) = upper(btrim(c.promo_code))
    where c.promo_code is not null
      and c.discounted_units > 0
      and pcu.promo_code_id = pc.id
      and pcu.user_id = c.user_id
      and pcu.event_id = c.event_id
    returning pcu.promo_code_id
  )
  select * from claimed;
$$;
