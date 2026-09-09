-- Scope the stale-checkout promo release to the event that owns the code.
--
-- Promo codes are unique PER EVENT, not globally:
--   promo_code_event_id_normalized_code_key
--     UNIQUE (event_id, upper(btrim(promo_code)))
-- so two organizers can both run "EARLYBIRD" -- which is the placeholder the
-- create-event wizard's promo field literally suggests, making collisions the
-- expected case rather than an edge one.
--
-- expire_stale_ticket_checkouts() runs every 5 minutes (cron jobid 5) and
-- matched promo rows by the code STRING alone:
--
--   update public.promo_code pc ... where pc.promo_code = sums.promo_code
--
-- With no event predicate, one buyer abandoning a checkout on event A
-- decremented `times_used` on EVERY event using the same code string. Other
-- organizers' counters drifted downward on traffic that was never theirs,
-- letting their codes be redeemed past `max_uses`. The matching promo_code_usage
-- delete had the same unscoped join: it could resolve `pc.id` to a different
-- event's code, in which case `pcu.promo_code_id = pc.id` failed to match the
-- real usage row and the buyer's own redemption was never released -- so they
-- could not re-apply their code after the checkout expired.
--
-- Both now join on (event_id, normalized code), which is exactly the unique
-- index above, so at most one promo_code row can ever match. The comparison is
-- normalized with upper(btrim(...)) for the same reason the index is: the code
-- stored on ticket_checkout comes from user input and need not match the
-- promo_code row's casing or padding character for character.
--
-- Behaviour is otherwise unchanged: same expiry window, same restock, same
-- greatest(0, ...) floor.

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
$function$;
