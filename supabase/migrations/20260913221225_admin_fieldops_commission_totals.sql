-- Admin console: what the field programme owes and has paid, summed in SQL.
--
-- Admin › Field Ops read every fieldops_commission row into JavaScript and
-- summed it there — with no limit on the overview (so PostgREST's default
-- 1,000-row cap applied silently) and a 5,000-row cap on the commissions
-- list, and it took the *first* row's currency as the currency of the total.
-- Money tiles that quietly stop counting past a row limit, or add cedis to
-- something else, are worse than no tiles.
--
-- This returns one object per currency, each status summed exactly. Sums are
-- of amount_minor as stored: a reversal is a negative row, so "paid" is net
-- of reversal offsets, which is what the pages already said it was.

create or replace function public.admin_fieldops_commission_totals(
  p_campaign_id uuid default null
)
  returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'currency',  t.currency,
        'rows',      t.rows,
        'pending',   t.pending,
        'approved',  t.approved,
        'in_payout', t.in_payout,
        'paid',      t.paid,
        'rejected',  t.rejected,
        'reversed',  t.reversed
      )
      order by t.rows desc, t.currency
    ),
    '[]'::jsonb
  )
  from (
    select
      c.currency,
      count(*)                                                        as rows,
      coalesce(sum(c.amount_minor) filter (where c.status = 'pending'),   0) as pending,
      coalesce(sum(c.amount_minor) filter (where c.status = 'approved'),  0) as approved,
      coalesce(sum(c.amount_minor) filter (where c.status = 'in_payout'), 0) as in_payout,
      coalesce(sum(c.amount_minor) filter (where c.status = 'paid'),      0) as paid,
      coalesce(sum(c.amount_minor) filter (where c.status = 'rejected'),  0) as rejected,
      coalesce(sum(c.amount_minor) filter (where c.status = 'reversed'),  0) as reversed
    from public.fieldops_commission c
    where p_campaign_id is null or c.campaign_id = p_campaign_id
    group by c.currency
  ) t;
$$;

revoke execute on function public.admin_fieldops_commission_totals(uuid) from public, anon, authenticated;
grant  execute on function public.admin_fieldops_commission_totals(uuid) to service_role;

comment on function public.admin_fieldops_commission_totals(uuid) is
  'Admin console only (service_role). fieldops_commission amount_minor summed per status, one object per currency, optionally for one campaign. Exact — no row cap.';
