-- Pre-existing bugs surfaced while verifying the customer-paid-service-fee
-- work against a real organizer's /finances page. Two more of the organizer
-- finance RPCs throw at runtime because organizer_ledger_entry.currency is
-- varchar(3) but they declare RETURNS TABLE(... currency text ...), and
-- RETURN QUERY requires an exact type match (see the same discovery in
-- 20260822090000). 20260822090000 only fixed get_organizer_finance_overview;
-- these two never got the cast, and 20260826205840_add_refund_hold_ledger_
-- accounting (local 20260903090000) re-replaced both to add refund_hold/
-- refund_release without adding it either.
--
--   get_organizer_pending_earnings   -> ERROR: returned type character
--     varying(3) does not match expected type text in column 3
--   get_organizer_ledger_transactions -> same, column 6
--
-- Effect: the /finances "Pending earnings" per-event list and the
-- /finances/transactions feed error on every load. Fix: cast le.currency to
-- text. Bodies are otherwise reproduced verbatim from the current live
-- definitions.

CREATE OR REPLACE FUNCTION public.get_organizer_pending_earnings()
RETURNS TABLE(event_id uuid, event_title text, currency text, amount numeric)
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.title,
    le.currency::text,
    SUM(le.amount)
  FROM public.organizer_ledger_entry le
  JOIN public.event e ON e.id = le.event_id
  WHERE le.organizer_id = auth.uid()
    AND le.entry_type IN ('earning', 'refund_adjustment', 'refund_hold', 'refund_release')
    AND NOT public.is_event_settled(le.event_id)
  GROUP BY e.id, e.title, le.currency
  HAVING SUM(le.amount) <> 0
  ORDER BY SUM(le.amount) DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_organizer_pending_earnings() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_organizer_ledger_transactions(
  p_cursor_created_at timestamp with time zone,
  p_cursor_id         uuid,
  p_limit             integer
)
RETURNS TABLE(
  entry_id    uuid,
  line        text,
  event_id    uuid,
  event_title text,
  amount      numeric,
  currency    text,
  status      text,
  reference   text,
  created_at  timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  WITH unified AS (
    SELECT le.id, 'ticket_sale'::text, le.event_id, e.title,
           le.gross_amount, le.currency::text, 'successful'::text,
           le.ticket_checkout_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'earning'

    UNION ALL

    SELECT le.id, 'platform_fee'::text, le.event_id, e.title,
           -1 * le.fee_amount, le.currency::text, 'completed'::text,
           le.ticket_checkout_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'earning'
      AND COALESCE(le.fee_amount, 0) <> 0

    UNION ALL

    SELECT le.id, 'refund'::text, le.event_id, e.title,
           le.amount, le.currency::text, 'processed'::text,
           le.transaction_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'refund_adjustment'

    UNION ALL

    SELECT le.id, 'refund'::text, le.event_id, e.title,
           le.amount, le.currency::text,
           CASE t.status WHEN 'refunded' THEN 'processed' ELSE 'processing' END,
           le.transaction_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    JOIN public.transaction t ON t.id = le.transaction_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'refund_hold'

    UNION ALL

    SELECT le.id, 'refund_release'::text, le.event_id, e.title,
           le.amount, le.currency::text, 'completed'::text,
           le.transaction_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'refund_release'

    UNION ALL

    SELECT le.id, 'payout'::text, le.event_id, NULL::text,
           le.amount, le.currency::text, p.status,
           p.reference, le.created_at
    FROM public.organizer_ledger_entry le
    JOIN public.payout p ON p.id = le.payout_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'payout_hold'

    UNION ALL

    SELECT le.id, 'payout_release'::text, le.event_id, NULL::text,
           le.amount, le.currency::text, p.status,
           p.reference, le.created_at
    FROM public.organizer_ledger_entry le
    JOIN public.payout p ON p.id = le.payout_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'payout_release'
  )
  SELECT * FROM unified u
  WHERE p_cursor_created_at IS NULL
     OR u.created_at < p_cursor_created_at
     OR (u.created_at = p_cursor_created_at AND u.id < p_cursor_id)
  ORDER BY u.created_at DESC, u.id DESC
  LIMIT p_limit;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_organizer_ledger_transactions(timestamp with time zone, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_organizer_ledger_transactions(timestamp with time zone, uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_organizer_ledger_transactions(timestamp with time zone, uuid, integer) TO authenticated;
