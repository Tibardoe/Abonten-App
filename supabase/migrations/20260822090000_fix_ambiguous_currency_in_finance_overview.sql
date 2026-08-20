-- Pre-existing bug (unrelated to the Places feature, present since
-- 20260819110000_add_organizer_finances_ledger.sql): get_organizer_finance_overview
-- declares RETURNS TABLE (currency text, ...), which makes Postgres create an
-- implicit `currency` OUT-parameter variable visible throughout the function
-- body. Every place inside the function's CTEs that referenced `currency`
-- unqualified (not table_alias.currency) was ambiguous between that OUT
-- parameter and the real table/CTE column of the same name -- Postgres's
-- default plpgsql.variable_conflict = error setting turns this into a hard
-- runtime error ("column reference \"currency\" is ambiguous") on every call,
-- meaning /finances, the Dashboard's finance summary, and Event Insights
-- (all three read this same RPC) have never been able to return real data.
-- Fix: qualify every reference to `currency` with its source relation. Also
-- casts the final SELECT's currency column to text (organizer_ledger_entry.
-- currency is varchar(3); RETURN QUERY requires an exact type match against
-- the declared RETURNS TABLE column type, not just an implicitly-castable
-- one -- discovered when qualifying the references surfaced this separate,
-- previously-masked type mismatch). Logic is otherwise unchanged.
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
      le.currency,
      le.amount,
      public.is_event_settled(le.event_id) AS settled
    FROM public.organizer_ledger_entry le
    WHERE le.organizer_id = auth.uid()
      AND le.entry_type IN ('earning', 'refund_adjustment')
  ),
  earning_totals AS (
    SELECT
      earning_rows.currency,
      COALESCE(SUM(earning_rows.amount) FILTER (WHERE NOT earning_rows.settled), 0) AS pending,
      COALESCE(SUM(earning_rows.amount) FILTER (WHERE earning_rows.settled), 0)     AS settled_net,
      COALESCE(SUM(earning_rows.amount), 0)                                        AS total
    FROM earning_rows
    GROUP BY earning_rows.currency
  ),
  payout_totals AS (
    SELECT
      organizer_ledger_entry.currency,
      COALESCE(SUM(organizer_ledger_entry.amount), 0) AS net
    FROM public.organizer_ledger_entry
    WHERE organizer_id = auth.uid()
      AND entry_type IN ('payout_hold', 'payout_release')
    GROUP BY organizer_ledger_entry.currency
  ),
  currencies AS (
    SELECT earning_totals.currency FROM earning_totals
    UNION
    SELECT payout_totals.currency FROM payout_totals
  )
  SELECT
    c.currency::text,
    COALESCE(et.pending, 0),
    COALESCE(et.settled_net, 0) + COALESCE(pt.net, 0),
    COALESCE(et.total, 0)
  FROM currencies c
  LEFT JOIN earning_totals et ON et.currency = c.currency
  LEFT JOIN payout_totals pt ON pt.currency = c.currency;
END;
$function$;
