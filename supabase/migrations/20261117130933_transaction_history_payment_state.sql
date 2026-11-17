-- The buyer's order history says what happened to an order's payment.
--
-- An order whose payment was declined, abandoned or never confirmed used to
-- show only as "Pending" or "Expired", with no word on whether money left
-- the buyer's account; failed tries at paying appeared nowhere once the
-- checkout page was gone (found during the live cutover, 2026-11-17).
-- get_user_transaction_history gains `payment_state` for an order not paid
-- (yet), from its latest payment_attempt:
--   awaiting       charge sent, provider not confirmed yet
--   finishing      paid, tickets not issued yet
--   failed         declined / abandoned at the provider (nothing charged)
--   not_completed  closed before it was paid (money taken later is refunded
--                  in full as an orphan capture)
-- null for a paid order, a subscription, or no payment started.
--
-- The return type changes, so the function is dropped and created again
-- (same body otherwise, migration 20261030200000), with its grants as
-- before: it runs with the caller's rights and reads only their own rows.

drop function if exists public.get_user_transaction_history(
  timestamp with time zone, timestamp with time zone,
  timestamp with time zone, uuid, integer
);

create function public.get_user_transaction_history(p_start timestamp with time zone, p_end timestamp with time zone, p_cursor_created_at timestamp with time zone, p_cursor_id uuid, p_limit integer)
 RETURNS TABLE(id uuid, kind text, status text, created_at timestamp with time zone, completed_at timestamp with time zone, amount numeric, currency text, title text, subtitle text, quantity integer, reference uuid, cancelled_quantity integer, refund_status text, refund_requested_at timestamp with time zone, service_fee numeric, total_paid numeric, credit_used numeric, payment_state text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  return query
  with raw as (
    select
      tc.id,
      'ticket'::text as kind,
      tc.status,
      (tc.created_at at time zone 'UTC') as created_at,
      tc.completed_at,
      tc.total_price as amount,
      tt.currency::text as currency,
      e.title,
      tt.type as subtitle,
      tc.quantity,
      coalesce(tc.checkout_session_id, tc.id) as reference,
      tix.cancelled_quantity,
      -- A payment refunded ticket by ticket: the line's cancelled tickets'
      -- own refunds speak for it (their payment stays 'successful' until its
      -- last tickets go). Without any, the payment's status, as before.
      case when parts.covered > 0 then parts.status else tix.refund_status end as refund_status,
      case when parts.covered > 0 then parts.requested_at else tix.refund_requested_at end as refund_requested_at,
      tix.txn_id,
      tix.txn_amount,
      tix.txn_credit,
      pay.payment_state
    from public.ticket_checkout tc
    left join public.ticket_type tt on tt.id = tc.ticket_type_id
    left join public.event e on e.id = tc.event_id
    left join lateral (
      select
        count(*) filter (where t.status = 'cancelled')::integer as cancelled_quantity,
        (array_agg(tr.status order by t.updated_at desc nulls last) filter (where t.status = 'cancelled'))[1] as refund_status,
        (array_agg(tr.refund_requested_at order by t.updated_at desc nulls last) filter (where t.status = 'cancelled'))[1] as refund_requested_at,
        (array_agg(t.transaction_id) filter (where t.transaction_id is not null))[1] as txn_id,
        max(tr.amount + coalesce(tr.credit_amount, 0)) as txn_amount,
        max(coalesce(tr.credit_amount, 0)) as txn_credit
      from public.ticket t
      left join public.transaction tr on tr.id = t.transaction_id
      where t.ticket_checkout_id = tc.id
    ) tix on true
    left join lateral (
      select
        count(*)::integer as covered,
        case
          when bool_or(p.status = 'failed') then 'successful'
          when bool_or(p.status in ('preparing', 'requested')) then 'refund_pending'
          else 'refunded'
        end as status,
        coalesce(max(p.created_at) filter (where p.status = 'failed'), max(p.created_at)) as requested_at
      from public.ticket t
      join lateral (
        select r.status, r.created_at
        from public.transaction_refund_ticket rt
        join public.transaction_refund r on r.id = rt.refund_id
        where rt.ticket_id = t.id
        order by r.created_at desc
        limit 1
      ) p on true
      where t.ticket_checkout_id = tc.id and t.status = 'cancelled'
    ) parts on true
    -- An order not paid (yet): what happened to its latest try at paying,
    -- so a declined or abandoned payment is not just a silent "Expired".
    -- payment_attempt is readable by its owner (payment_attempt_owner_select).
    left join lateral (
      select
        case
          when a.status in ('pending', 'processing')
            or (a.status = 'initiated' and a.metadata ->> 'mode' = 'direct')
            then 'awaiting'
          when a.status = 'fulfillment_failed' then 'finishing'
          when a.status = 'failed' then 'failed'
          when a.status = 'cancelled' then 'not_completed'
        end as payment_state
      from public.payment_attempt a
      where a.checkout_session_id = tc.checkout_session_id
        and a.user_id = tc.user_id
      order by a.created_at desc
      limit 1
    ) pay on tc.status <> 'paid'
    where tc.user_id = auth.uid()
      and (p_start is null or (tc.created_at at time zone 'UTC') >= p_start)
      and (p_end   is null or (tc.created_at at time zone 'UTC') <= p_end)

    union all

    select
      sc.id,
      'subscription'::text,
      sc.status,
      sc.created_at,
      sc.completed_at,
      sc.total_price,
      sc.currency::text,
      sc.subscription_plan_name,
      'Subscription'::text,
      null::integer,
      sc.id,
      null::integer,
      null::text,
      null::timestamptz,
      null::uuid,
      null::numeric,
      null::numeric,
      null::text
    from public.subscription_checkout sc
    where sc.user_id = auth.uid()
      and (p_start is null or sc.created_at >= p_start)
      and (p_end   is null or sc.created_at <= p_end)
  ),
  shared as (
    select
      r.*,
      r.amount / nullif((
        select sum(tc2.total_price)
        from public.ticket_checkout tc2
        where tc2.id in (
          select distinct t2.ticket_checkout_id
          from public.ticket t2
          where t2.transaction_id = r.txn_id
            and t2.ticket_checkout_id is not null
        )
      ), 0) as share
    from raw r
  ),
  priced as (
    select
      s.*,
      case
        when s.txn_id is null or s.txn_amount is null then 0::numeric
        else greatest(public.money_round(s.txn_amount * s.share - s.amount, s.currency), 0::numeric)
      end as service_fee,
      case
        when s.txn_id is null or coalesce(s.txn_credit, 0) = 0 then 0::numeric
        else public.money_round(s.txn_credit * coalesce(s.share, 0), s.currency)
      end as credit_used
    from shared s
  )
  select
    u.id, u.kind, u.status, u.created_at, u.completed_at, u.amount, u.currency,
    u.title, u.subtitle, u.quantity, u.reference, u.cancelled_quantity,
    u.refund_status, u.refund_requested_at,
    u.service_fee,
    u.amount + u.service_fee as total_paid,
    u.credit_used,
    u.payment_state
  from priced u
  where p_cursor_created_at is null
     or u.created_at < p_cursor_created_at
     or (u.created_at = p_cursor_created_at and u.id < p_cursor_id)
  order by u.created_at desc, u.id desc
  limit p_limit;
end;
$function$;

revoke all on function public.get_user_transaction_history(
  timestamp with time zone, timestamp with time zone,
  timestamp with time zone, uuid, integer
) from public;
grant execute on function public.get_user_transaction_history(
  timestamp with time zone, timestamp with time zone,
  timestamp with time zone, uuid, integer
) to anon, authenticated, service_role;
