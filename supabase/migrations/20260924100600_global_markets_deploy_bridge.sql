-- Global markets, part 7: a deploy bridge for the code already running.
--
-- Parts 1–6 change the money path under the code that is live when they
-- are applied: `transaction.paystack_reference` became `provider_reference`,
-- `transaction.provider` is required, payment attempts and payout accounts
-- now carry a market, and `cancel_event_and_release_tickets` returns
-- `provider_reference`. The web deployment that knows all this ships a few
-- minutes after the migrations. So that Ghana's checkout, refunds, payout
-- accounts and cancellations keep working in between, this part:
--
--   * keeps a `transaction.paystack_reference` mirror of `provider_reference`
--     (either one written fills the other), and fills the new required
--     columns for a row written the old way;
--   * gives a payment attempt or payout account written without a market
--     the default market's (Ghana's) values, as the old code assumed;
--   * returns `paystack_reference` beside `provider_reference` from the
--     cancellation function.
--
-- Nothing here is needed once the new code is live; part 8
-- (20260924100700) removes all of it and is applied after that deploy has
-- been checked.

alter table public.transaction add column paystack_reference text;
update public.transaction set paystack_reference = provider_reference where paystack_reference is null;

create or replace function public.transaction_legacy_writer_bridge()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.paystack_reference is distinct from old.paystack_reference
     and new.provider_reference is not distinct from old.provider_reference then
    new.provider_reference := new.paystack_reference;
  end if;
  new.provider_reference := coalesce(new.provider_reference, new.paystack_reference);
  new.paystack_reference := new.provider_reference;
  if new.provider is null then
    new.provider := case when new.payment_method = 'abonten_credit' then 'abonten_credit' else 'paystack' end;
  end if;
  new.country_code := coalesce(new.country_code, public.default_market_country());
  new.settlement_currency := coalesce(new.settlement_currency, upper(new.currency));
  return new;
end;
$$;
revoke all on function public.transaction_legacy_writer_bridge() from public, anon, authenticated;
create trigger transaction_legacy_writer_bridge
  before insert or update on public.transaction
  for each row execute function public.transaction_legacy_writer_bridge();

create or replace function public.payment_attempt_legacy_writer_bridge()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.provider := coalesce(new.provider, 'paystack');
  new.country_code := coalesce(new.country_code, public.default_market_country());
  return new;
end;
$$;
revoke all on function public.payment_attempt_legacy_writer_bridge() from public, anon, authenticated;
create trigger payment_attempt_legacy_writer_bridge
  before insert on public.payment_attempt
  for each row execute function public.payment_attempt_legacy_writer_bridge();

create or replace function public.payout_account_legacy_writer_bridge()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.country_code := coalesce(new.country_code, public.default_market_country());
  new.currency := coalesce(new.currency, public.default_market_currency());
  return new;
end;
$$;
revoke all on function public.payout_account_legacy_writer_bridge() from public, anon, authenticated;
create trigger payout_account_legacy_writer_bridge
  before insert on public.payout_account
  for each row execute function public.payout_account_legacy_writer_bridge();

drop function if exists public.cancel_event_and_release_tickets(uuid);

CREATE OR REPLACE FUNCTION public.cancel_event_and_release_tickets(p_event_id uuid)
 RETURNS TABLE(refund_transaction_id uuid, attendee_user_id uuid, provider text, provider_reference text, transaction_amount numeric, transaction_currency character varying, event_title text, paystack_reference text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_event_id uuid;
  v_event_title text;
  v_current_status text;
begin
  update public.event
     set status = 'canceled'
   where id = p_event_id
     and organizer_id = auth.uid()
     and status in ('draft', 'published')
  returning id, title into v_event_id, v_event_title;

  if v_event_id is null then
    select status into v_current_status
      from public.event
     where id = p_event_id and organizer_id = auth.uid();

    if v_current_status is null then
      raise exception 'Event not found or not owned by caller';
    elsif v_current_status = 'canceled' then
      raise exception 'Event is already cancelled';
    else
      raise exception 'Event cannot be cancelled from its current status';
    end if;
  end if;

  return query
  with cancelled_tickets as (
    update public.ticket t
       set status = 'cancelled', updated_at = now()
      from public.ticket_type tt
     where t.ticket_type_id = tt.id
       and tt.event_id = v_event_id
       and t.status in ('active', 'used')
    returning t.id as ticket_id, t.user_id, t.transaction_id
  ),
  cancel_attendance as (
    update public.attendance
       set status = 'cancelled'
     where event_id = v_event_id
       and status = 'attending'
    returning id
  ),
  cancel_checkouts as (
    update public.ticket_checkout
       set status = 'cancelled', updated_at = now()
     where event_id = v_event_id
       and status = 'paid'
    returning id
  ),
  refundable as (
    select
      ct.user_id,
      ct.transaction_id,
      tr.amount,
      coalesce(tr.amount, 0) + coalesce(tr.credit_amount, 0) as paid_total,
      tr.currency,
      tr.provider,
      tr.provider_reference
    from cancelled_tickets ct
    left join public.transaction tr on tr.id = ct.transaction_id
  ),
  notify as (
    insert into public.notification (user_id, type, title, body, link)
    select distinct on (r.user_id)
      r.user_id,
      'event_cancelled',
      'Event cancelled',
      case
        when r.paid_total > 0 then format(
          'The organizer has cancelled %s. Your ticket is no longer valid. A refund will be issued to the payment method used for your ticket.',
          v_event_title
        )
        else format(
          'The organizer has cancelled %s. Your registration has been cancelled.',
          v_event_title
        )
      end,
      case when r.paid_total > 0 then '/manage/my-events?tab=refunds' else '/manage/my-events?tab=cancelled' end
    from refundable r
    order by r.user_id, (r.paid_total > 0) desc nulls last
    returning id
  )
  select distinct
    r.transaction_id, r.user_id, r.provider, r.provider_reference, r.paid_total, r.currency, v_event_title,
    r.provider_reference
    from refundable r
   where r.transaction_id is not null and r.paid_total > 0;
end;
$function$;

revoke all on function public.cancel_event_and_release_tickets(uuid) from public, anon;
grant execute on function public.cancel_event_and_release_tickets(uuid) to authenticated, service_role;
