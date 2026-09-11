-- Two follow-ups to the money-path lockdown (20260910230109) and Phase 3
-- ticket credit (20260910233238).
--
-- 1. The last client-writable checkout tables.
--
--    promo_code_usage: a buyer could delete their own "already used this
--    code" row and apply a once-per-customer code again. promo_code: any
--    signed-in user could UPDATE any code (a trigger limited them to
--    times_used), so they could reset a code's usage count to 0 and use it
--    past max_uses, or push it to max_uses so nobody else could. Both only
--    existed so promoUsage.ts could run as the buyer; it now writes with the
--    service role after checking the checkout is the caller's. Organizers
--    keep full control of their own codes.
--
--    subscription / subscription_checkout: owners could insert and update
--    their own rows (e.g. mark a subscription checkout paid). No code reads
--    or writes either table today, so nothing breaks; this just stops them
--    being writable before a feature relies on them.
--
-- 2. A mixed (cash + credit) refund whose cash part later fails.
--
--    issueRefundCore returns the credit share immediately and asks Paystack
--    for the cash share. If Paystack then reports refund.failed, the webhook
--    moved the order back to 'successful' and record_refund_release reversed
--    the WHOLE organizer hold -- including the part matching the credit the
--    buyer already got back, so the organizer was paid for tickets whose
--    money had been returned. record_refund_release now releases only the
--    cash share when credit was returned, and record_refund_hold tops the
--    hold up to the full amount instead of adding a second full hold.
--
--    Working from the net outstanding hold also fixes an older problem: a
--    refund that failed twice released BOTH earlier holds on the second
--    failure (it mirrored every refund_hold row ever written for the order),
--    crediting the organizer one refund too many.

-- ---------------------------------------------------------------------
-- 1. Client write access
-- ---------------------------------------------------------------------

drop policy if exists promo_code_update on public.promo_code;
create policy promo_code_organizer_update on public.promo_code
  for update using (
    exists (select 1 from public.event e
            where e.id = promo_code.event_id and e.organizer_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.event e
            where e.id = promo_code.event_id and e.organizer_id = (select auth.uid()))
  );
revoke truncate on table public.promo_code from anon, authenticated;

drop policy if exists promo_code_usage_owner_insert on public.promo_code_usage;
drop policy if exists promo_code_usage_owner_delete on public.promo_code_usage;
revoke insert, update, delete, truncate on table public.promo_code_usage from anon, authenticated;

drop policy if exists subscription_owner_insert on public.subscription;
drop policy if exists subscription_owner_update on public.subscription;
revoke insert, update, delete, truncate on table public.subscription from anon, authenticated;

drop policy if exists subscription_checkout_owner_insert on public.subscription_checkout;
drop policy if exists subscription_checkout_owner_update on public.subscription_checkout;
revoke insert, update, delete, truncate on table public.subscription_checkout from anon, authenticated;

-- A lookup table (no write policy already); the grants go too.
revoke insert, update, delete, truncate on table public.subscription_plan from anon, authenticated;

-- Only the pg_cron job calls this.
revoke execute on function public.expire_stale_subscription_checkouts() from public, anon, authenticated;
grant execute on function public.expire_stale_subscription_checkouts() to service_role;

-- ---------------------------------------------------------------------
-- 2. Organizer refund holds follow the net outstanding amount
-- ---------------------------------------------------------------------

create or replace function public.record_refund_hold(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  rec record;
begin
  update public.transaction
  set status = 'refund_pending',
      refund_requested_at = coalesce(refund_requested_at, now()),
      updated_at = now()
  where id = p_transaction_id and status = 'successful';

  if not found then
    return;
  end if;

  -- Same lock order as request_organizer_payout, so a withdrawal and a
  -- refund hold never race on one balance snapshot.
  for rec in
    select distinct le.organizer_id, le.currency
    from public.ticket t
    join public.ticket_checkout tc on tc.id = t.ticket_checkout_id
    join public.organizer_ledger_entry le
      on le.ticket_checkout_id = tc.id and le.entry_type = 'earning'
    where t.transaction_id = p_transaction_id and t.ticket_checkout_id is not null
    order by le.organizer_id, le.currency
  loop
    perform pg_advisory_xact_lock(hashtextextended(rec.organizer_id::text || ':' || rec.currency, 0));
  end loop;

  -- Hold the refunded tickets' share of each checkout's earning, minus
  -- whatever is still held from an earlier attempt (the credit share of a
  -- mixed refund stays held when its cash part fails, see
  -- record_refund_release). A first refund has nothing outstanding, so this
  -- is the full share, as before.
  insert into public.organizer_ledger_entry (
    organizer_id, event_id, ticket_checkout_id, transaction_id, entry_type, amount, currency
  )
  select
    le.organizer_id,
    le.event_id,
    le.ticket_checkout_id,
    p_transaction_id,
    'refund_hold',
    target.amount - coalesce(prior.net, 0),
    le.currency
  from (
    select t.ticket_checkout_id, count(*) as units
    from public.ticket t
    where t.transaction_id = p_transaction_id
      and t.ticket_checkout_id is not null
    group by t.ticket_checkout_id
  ) refunded
  join public.ticket_checkout tc on tc.id = refunded.ticket_checkout_id
  join public.organizer_ledger_entry le
    on le.ticket_checkout_id = tc.id and le.entry_type = 'earning'
  cross join lateral (
    select -1 * round(le.amount / nullif(tc.quantity, 0) * refunded.units, 2) as amount
  ) target
  left join lateral (
    select sum(x.amount) as net
    from public.organizer_ledger_entry x
    where x.transaction_id = p_transaction_id
      and x.ticket_checkout_id = le.ticket_checkout_id
      and x.organizer_id = le.organizer_id
      and x.entry_type in ('refund_hold', 'refund_release')
  ) prior on true
  where target.amount - coalesce(prior.net, 0) < 0;
end;
$function$;

-- Called only from the Paystack webhook's refund.failed branch, behind its
-- refund_pending -> successful guard.
create or replace function public.record_refund_release(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  rec          record;
  v_cash       numeric;
  v_credit     numeric;
  v_returned   numeric;
  v_cash_ratio numeric := 1;
begin
  select t.amount, t.credit_amount, t.credit_refunded_amount
    into v_cash, v_credit, v_returned
  from public.transaction t
  where t.id = p_transaction_id;

  -- The credit share of a mixed refund went back to the buyer when the
  -- refund was requested and stays returned; only the cash share failed, so
  -- only that part of the hold goes back to the organizer. The shares are
  -- the same proportions issueRefundCore split the refund by.
  if coalesce(v_returned, 0) > 0 and coalesce(v_cash, 0) + coalesce(v_credit, 0) > 0 then
    v_cash_ratio := coalesce(v_cash, 0) / (coalesce(v_cash, 0) + coalesce(v_credit, 0));
  end if;

  for rec in
    select distinct organizer_id, currency
    from public.organizer_ledger_entry
    where transaction_id = p_transaction_id and entry_type = 'refund_hold'
    order by organizer_id, currency
  loop
    perform pg_advisory_xact_lock(hashtextextended(rec.organizer_id::text || ':' || rec.currency, 0));
  end loop;

  insert into public.organizer_ledger_entry (
    organizer_id, event_id, ticket_checkout_id, transaction_id, entry_type, amount, currency
  )
  select h.organizer_id, h.event_id, h.ticket_checkout_id, h.transaction_id,
         'refund_release', round(-1 * h.net * v_cash_ratio, 2), h.currency
  from (
    select organizer_id, event_id, ticket_checkout_id, transaction_id, currency,
           sum(amount) as net
    from public.organizer_ledger_entry
    where transaction_id = p_transaction_id
      and entry_type in ('refund_hold', 'refund_release')
    group by organizer_id, event_id, ticket_checkout_id, transaction_id, currency
  ) h
  where round(-1 * h.net * v_cash_ratio, 2) > 0;
end;
$function$;

revoke execute on function public.record_refund_hold(uuid) from public, anon, authenticated;
grant execute on function public.record_refund_hold(uuid) to service_role;
revoke execute on function public.record_refund_release(uuid) from public, anon, authenticated;
grant execute on function public.record_refund_release(uuid) to service_role;
