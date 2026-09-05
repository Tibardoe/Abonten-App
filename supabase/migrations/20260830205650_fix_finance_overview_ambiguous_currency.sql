-- get_organizer_finance_overview() throws "column reference \"currency\" is
-- ambiguous" on every call — so /finances Overview renders zeros for every
-- organizer. REGRESSION: 20260822090000_fix_ambiguous_currency_in_finance_
-- overview.sql originally fixed it (qualify every `currency` ref + cast the
-- final column to text), but the CREATE OR REPLACE in
-- 20260826205840_add_refund_hold_ledger_accounting (local file
-- 20260903090000) — which added refund_hold/refund_release to the entry_type
-- filter — reintroduced the bare `currency` references, which collide with
-- the RETURNS TABLE `currency` OUT-parameter.
--
-- Fix: alias the grouping column as `cur` throughout (can't collide with the
-- OUT param) and cast it to text (organizer_ledger_entry.currency is
-- varchar(3); RETURN QUERY needs an exact type match, not just a castable
-- one — see 20260822090000's own note). Numeric columns cast too for the
-- same reason. Logic otherwise identical to the 20260903090000 version.
-- Forward-only, same as 20260822090000 was for 20260819110000.
CREATE OR REPLACE FUNCTION public.get_organizer_finance_overview()
RETURNS TABLE (
  currency          text,
  pending_balance   numeric,
  available_balance numeric,
  total_earnings    numeric
)
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  WITH earning_rows AS (
    SELECT
      le.currency::text AS cur,
      le.amount         AS amt,
      public.is_event_settled(le.event_id) AS settled
    FROM public.organizer_ledger_entry le
    WHERE le.organizer_id = auth.uid()
      AND le.entry_type IN ('earning', 'refund_adjustment', 'refund_hold', 'refund_release')
  ),
  earning_totals AS (
    SELECT
      er.cur,
      COALESCE(SUM(er.amt) FILTER (WHERE NOT er.settled), 0) AS pending,
      COALESCE(SUM(er.amt) FILTER (WHERE er.settled), 0)     AS settled_net,
      COALESCE(SUM(er.amt), 0)                               AS total
    FROM earning_rows er
    GROUP BY er.cur
  ),
  payout_totals AS (
    SELECT le.currency::text AS cur, COALESCE(SUM(le.amount), 0) AS net
    FROM public.organizer_ledger_entry le
    WHERE le.organizer_id = auth.uid()
      AND le.entry_type IN ('payout_hold', 'payout_release')
    GROUP BY le.currency::text
  ),
  currencies AS (
    SELECT cur FROM earning_totals
    UNION
    SELECT cur FROM payout_totals
  )
  SELECT
    c.cur,
    COALESCE(et.pending, 0)::numeric,
    (COALESCE(et.settled_net, 0) + COALESCE(pt.net, 0))::numeric,
    COALESCE(et.total, 0)::numeric
  FROM currencies c
  LEFT JOIN earning_totals et ON et.cur = c.cur
  LEFT JOIN payout_totals pt ON pt.cur = c.cur;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_organizer_finance_overview() TO authenticated;
