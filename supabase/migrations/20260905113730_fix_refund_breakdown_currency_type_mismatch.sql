-- Both get_event_refund_breakdown and get_organizer_refund_breakdown declare
-- RETURNS TABLE(currency text, ...) but select organizer_ledger_entry.currency,
-- which is varchar(3) -- PL/pgSQL's RETURN QUERY enforces exact column type
-- match (not just implicit-cast-compatible), so both functions threw
-- "42804: structure of query does not match function result type" the moment
-- there was an actual refund_hold row to return. Discovered by a new
-- integration test (SEC-001 regression suite,
-- packages/services/src/__integration__/sec001-organizer-scoped.integration
-- .test.ts) that, unlike prior manual testing, actually exercised the
-- non-empty-result path. Fix: cast le.currency::text in the SELECT list of
-- both -- no behavior change beyond no longer crashing, no schema change.

CREATE OR REPLACE FUNCTION public.get_event_refund_breakdown(p_event_id uuid)
 RETURNS TABLE(currency text, refund_request_count bigint, pending_refund_amount numeric, completed_refund_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.event e
    WHERE e.id = p_event_id AND e.organizer_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    le.currency::text,
    COUNT(DISTINCT le.transaction_id),
    COALESCE(SUM(-1 * le.amount) FILTER (WHERE t.status = 'refund_pending'), 0),
    COALESCE(SUM(-1 * le.amount) FILTER (WHERE t.status = 'refunded'), 0)
  FROM public.organizer_ledger_entry le
  JOIN public.transaction t ON t.id = le.transaction_id
  WHERE le.event_id = p_event_id
    AND le.organizer_id = auth.uid()
    AND le.entry_type = 'refund_hold'
  GROUP BY le.currency;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_organizer_refund_breakdown()
 RETURNS TABLE(currency text, refund_request_count bigint, pending_refund_amount numeric, completed_refund_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    le.currency::text,
    COUNT(DISTINCT le.transaction_id),
    COALESCE(SUM(-1 * le.amount) FILTER (WHERE t.status = 'refund_pending'), 0),
    COALESCE(SUM(-1 * le.amount) FILTER (WHERE t.status = 'refunded'), 0)
  FROM public.organizer_ledger_entry le
  JOIN public.transaction t ON t.id = le.transaction_id
  WHERE le.organizer_id = auth.uid()
    AND le.entry_type = 'refund_hold'
  GROUP BY le.currency;
END;
$function$;
