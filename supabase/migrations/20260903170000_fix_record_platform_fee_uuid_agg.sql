-- Follow-up to 20260903130000: record_platform_fee used MIN(x.event_id) on a
-- uuid column, which PG15 has no aggregate for — the function errored on
-- every call (non-fatally: finalizePaystackPayment.ts logs and continues, so
-- no fee-revenue row was ever written). Replace with an array_agg pick (only
-- read when COUNT(DISTINCT event_id) = 1). Signature unchanged; also folded
-- into 20260903130000 for fresh installs.
CREATE OR REPLACE FUNCTION public.record_platform_fee(
  p_transaction_id  uuid,
  p_processing_cost numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ticket_revenue numeric(12,2);
  v_currency       varchar(3);
  v_distinct_events integer;
  v_event_id       uuid;
  v_fee_rate       numeric(6,4);
  v_txn_amount     numeric(12,2);
  v_service_fee    numeric(12,2);
BEGIN
  SELECT
    COALESCE(SUM(x.total_price), 0),
    MIN(x.currency),
    COUNT(DISTINCT x.event_id),
    (array_agg(x.event_id))[1]
  INTO v_ticket_revenue, v_currency, v_distinct_events, v_event_id
  FROM (
    SELECT DISTINCT tc.id, tc.total_price, tc.event_id, COALESCE(tt.currency, 'GHS') AS currency
    FROM public.ticket t
    JOIN public.ticket_checkout tc ON tc.id = t.ticket_checkout_id
    JOIN public.ticket_type tt ON tt.id = tc.ticket_type_id
    WHERE t.transaction_id = p_transaction_id
      AND t.ticket_checkout_id IS NOT NULL
  ) x;

  IF v_ticket_revenue IS NULL OR v_ticket_revenue <= 0 THEN
    RETURN;
  END IF;

  v_fee_rate := COALESCE(public.get_active_platform_fee_rate(v_currency::text), 0);

  SELECT amount INTO v_txn_amount
  FROM public.transaction
  WHERE id = p_transaction_id;

  v_service_fee := round(COALESCE(v_txn_amount, v_ticket_revenue) - v_ticket_revenue, 2);
  IF v_service_fee < 0 THEN
    v_service_fee := round(v_ticket_revenue * v_fee_rate, 2);
  END IF;

  INSERT INTO public.platform_fee_entry (
    transaction_id, event_id, entry_type,
    ticket_revenue, service_fee, total_customer_payment,
    processing_cost, net_revenue, fee_rate, currency
  ) VALUES (
    p_transaction_id,
    CASE WHEN v_distinct_events = 1 THEN v_event_id ELSE NULL END,
    'fee',
    v_ticket_revenue,
    v_service_fee,
    v_ticket_revenue + v_service_fee,
    p_processing_cost,
    CASE WHEN p_processing_cost IS NULL THEN NULL ELSE round(v_service_fee - p_processing_cost, 2) END,
    v_fee_rate,
    v_currency
  )
  ON CONFLICT (transaction_id) WHERE entry_type = 'fee' DO NOTHING;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_platform_fee(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_platform_fee(uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_platform_fee(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_platform_fee(uuid, numeric) TO service_role;
