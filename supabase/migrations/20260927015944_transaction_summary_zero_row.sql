-- get_user_transaction_summary returns no row at all when the person has no
-- paid purchase in the chosen period.
--
-- Until 2026-09-24 the function always returned one row (the web and app
-- summary tiles rely on it: "The RPC always returns at least one (currency,
-- ...) row, even at zero activity"). The per-currency rewrite in
-- 20260924100100 (repeated in 20260925100000) builds the result as
-- `money_rows CROSS JOIN counts`, so with no paid purchase money_rows is
-- empty and the whole result is empty. Every new customer, and anyone
-- looking at a month without a purchase, saw "We couldn't load your
-- transaction summary" -- and a period with only pending or failed checkouts
-- lost those counts too.
--
-- Fix: money_rows carries a zero row in the default market's currency when
-- there is no money to report, so the counts always come back. Everything
-- else is the 20260925100000 definition unchanged.

-- Replace only the definition this migration was written against.
do $$
begin
  if md5(pg_get_functiondef(
       'public.get_user_transaction_summary(timestamptz,timestamptz)'::regprocedure
     )) <> '48fa0c99308f50c938aefd285e92c674' then
    raise exception 'get_user_transaction_summary changed since 20260925100000; re-derive this fix';
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.get_user_transaction_summary(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(currency text, amount_spent numeric, total_transactions bigint, successful_count bigint, pending_count bigint, failed_count bigint, tickets_purchased bigint, subscriptions_count bigint)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  return query
  with my_tc as (
    select tc.*
    from public.ticket_checkout tc
    where tc.user_id = auth.uid()
      and (p_start is null or (tc.created_at at time zone 'UTC') >= p_start)
      and (p_end   is null or (tc.created_at at time zone 'UTC') <= p_end)
  ),
  my_sc as (
    select sc.*
    from public.subscription_checkout sc
    where sc.user_id = auth.uid()
      and (p_start is null or sc.created_at >= p_start)
      and (p_end   is null or sc.created_at <= p_end)
  ),
  counts as (
    select
      (select count(*) from my_tc) + (select count(*) from my_sc) as total_transactions,
      (select count(*) from my_tc where status = 'paid')
        + (select count(*) from my_sc where status = 'paid')      as successful_count,
      (select count(*) from my_tc where status = 'pending')
        + (select count(*) from my_sc where status = 'pending')   as pending_count,
      (select count(*) from my_tc where status = 'failed')
        + (select count(*) from my_sc where status = 'failed')    as failed_count,
      (select coalesce(sum(quantity), 0) from my_tc where status = 'paid') as tickets_purchased,
      (select count(*) from my_sc where status = 'paid')          as subscriptions_count
  ),
  money_by_currency as (
    select
      tt.currency::text as currency,
      sum(
        mtc.total_price
        + case
            when txn.id is null or txn.amount is null then 0::numeric
            else greatest(
              round(
                txn.amount
                  * (mtc.total_price / nullif((
                      select sum(tc2.total_price)
                      from public.ticket_checkout tc2
                      where tc2.id in (
                        select distinct t2.ticket_checkout_id
                        from public.ticket t2
                        where t2.transaction_id = txn.id
                          and t2.ticket_checkout_id is not null
                      )
                    ), 0))
                  - mtc.total_price,
                public.currency_minor_units(tt.currency)),
              0::numeric
            )
          end
      ) as spent
    from my_tc mtc
    join public.ticket_type tt on tt.id = mtc.ticket_type_id
    left join lateral (
      select tr.id, tr.amount
      from public.ticket t
      join public.transaction tr on tr.id = t.transaction_id
      where t.ticket_checkout_id = mtc.id
      limit 1
    ) txn on true
    where mtc.status = 'paid'
    group by tt.currency

    union all

    select msc.currency::text, coalesce(sum(msc.total_price), 0)
    from my_sc msc
    where msc.status = 'paid'
    group by msc.currency
  ),
  money_rows as (
    select money_by_currency.currency, sum(money_by_currency.spent) as amount_spent
    from money_by_currency
    group by money_by_currency.currency

    union all

    -- Nothing paid in the period: one zero row, so the counts still return.
    select public.default_market_currency(), 0::numeric
    where not exists (select 1 from money_by_currency)
  )
  select mr.currency, mr.amount_spent, c.total_transactions, c.successful_count,
         c.pending_count, c.failed_count, c.tickets_purchased, c.subscriptions_count
  from money_rows mr
  cross join counts c;
end;
$function$;
