-- Global markets, part 8: remove the deploy bridge (part 7).
--
-- Apply only after the web and admin deployments that use
-- `provider_reference`, `provider` and the market columns are live and a
-- Ghana purchase, refund and cancellation have been checked on them.

drop trigger if exists transaction_legacy_writer_bridge on public.transaction;
drop function if exists public.transaction_legacy_writer_bridge();
drop trigger if exists payment_attempt_legacy_writer_bridge on public.payment_attempt;
drop function if exists public.payment_attempt_legacy_writer_bridge();
drop trigger if exists payout_account_legacy_writer_bridge on public.payout_account;
drop function if exists public.payout_account_legacy_writer_bridge();
alter table public.transaction drop column if exists paystack_reference;

-- Every OTP writer now names its provider.
alter table public.phone_otp_state alter column provider drop default;

drop function if exists public.cancel_event_and_release_tickets(uuid);

CREATE OR REPLACE FUNCTION public.cancel_event_and_release_tickets(p_event_id uuid)
 RETURNS TABLE(refund_transaction_id uuid, attendee_user_id uuid, provider text, provider_reference text, transaction_amount numeric, transaction_currency character varying, event_title text)
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
    r.transaction_id, r.user_id, r.provider, r.provider_reference, r.paid_total, r.currency, v_event_title
    from refundable r
   where r.transaction_id is not null and r.paid_total > 0;
end;
$function$;

revoke all on function public.cancel_event_and_release_tickets(uuid) from public, anon;
grant execute on function public.cancel_event_and_release_tickets(uuid) to authenticated, service_role;
