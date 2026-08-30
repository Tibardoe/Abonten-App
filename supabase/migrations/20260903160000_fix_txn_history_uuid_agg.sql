-- Follow-up to 20260903150000 (applied minutes earlier): its
-- get_user_transaction_history body used max(t.transaction_id) on a uuid
-- column, which PG15 has no aggregate for — the function would error on its
-- first call. Replace with an array_agg pick (all tickets of one checkout
-- share one transaction_id anyway). Signature unchanged, so CREATE OR
-- REPLACE. Also folded into 20260903150000 for fresh installs.
CREATE OR REPLACE FUNCTION public.get_user_transaction_history(
  p_start             timestamp with time zone,
  p_end               timestamp with time zone,
  p_cursor_created_at  timestamp with time zone,
  p_cursor_id          uuid,
  p_limit              integer
)
RETURNS TABLE(
  id                  uuid,
  kind                text,
  status              text,
  created_at          timestamp with time zone,
  completed_at        timestamp with time zone,
  amount              numeric,
  currency            text,
  title               text,
  subtitle            text,
  quantity            integer,
  reference           uuid,
  cancelled_quantity  integer,
  refund_status       text,
  refund_requested_at timestamp with time zone,
  service_fee         numeric,
  total_paid          numeric
)
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  WITH raw AS (
    SELECT
      tc.id,
      'ticket'::text AS kind,
      tc.status,
      (tc.created_at AT TIME ZONE 'UTC') AS created_at,
      tc.completed_at,
      tc.total_price AS amount,
      COALESCE(tt.currency, 'GHS') AS currency,
      e.title,
      tt.type AS subtitle,
      tc.quantity,
      COALESCE(tc.checkout_session_id, tc.id) AS reference,
      tix.cancelled_quantity,
      tix.refund_status,
      tix.refund_requested_at,
      tix.txn_id,
      tix.txn_amount
    FROM public.ticket_checkout tc
    LEFT JOIN public.ticket_type tt ON tt.id = tc.ticket_type_id
    LEFT JOIN public.event e ON e.id = tc.event_id
    LEFT JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE t.status = 'cancelled')::integer AS cancelled_quantity,
        (array_agg(tr.status ORDER BY t.updated_at DESC NULLS LAST) FILTER (WHERE t.status = 'cancelled'))[1] AS refund_status,
        (array_agg(tr.refund_requested_at ORDER BY t.updated_at DESC NULLS LAST) FILTER (WHERE t.status = 'cancelled'))[1] AS refund_requested_at,
        (array_agg(t.transaction_id) FILTER (WHERE t.transaction_id IS NOT NULL))[1] AS txn_id,
        max(tr.amount) AS txn_amount
      FROM public.ticket t
      LEFT JOIN public.transaction tr ON tr.id = t.transaction_id
      WHERE t.ticket_checkout_id = tc.id
    ) tix ON true
    WHERE tc.user_id = auth.uid()
      AND (p_start IS NULL OR (tc.created_at AT TIME ZONE 'UTC') >= p_start)
      AND (p_end   IS NULL OR (tc.created_at AT TIME ZONE 'UTC') <= p_end)

    UNION ALL

    SELECT
      sc.id,
      'subscription'::text,
      sc.status,
      sc.created_at,
      sc.completed_at,
      sc.total_price,
      'GHS'::text,
      sc.subscription_plan_name,
      'Subscription'::text,
      NULL::integer,
      sc.id,
      NULL::integer,
      NULL::text,
      NULL::timestamptz,
      NULL::uuid,
      NULL::numeric
    FROM public.subscription_checkout sc
    WHERE sc.user_id = auth.uid()
      AND (p_start IS NULL OR sc.created_at >= p_start)
      AND (p_end   IS NULL OR sc.created_at <= p_end)
  ),
  priced AS (
    SELECT
      r.*,
      CASE
        WHEN r.txn_id IS NULL OR r.txn_amount IS NULL THEN 0::numeric
        ELSE GREATEST(
          round(
            r.txn_amount
              * (r.amount / NULLIF((
                  SELECT SUM(tc2.total_price)
                  FROM public.ticket_checkout tc2
                  WHERE tc2.id IN (
                    SELECT DISTINCT t2.ticket_checkout_id
                    FROM public.ticket t2
                    WHERE t2.transaction_id = r.txn_id
                      AND t2.ticket_checkout_id IS NOT NULL
                  )
                ), 0))
              - r.amount,
            2),
          0::numeric
        )
      END AS service_fee
    FROM raw r
  )
  SELECT
    u.id, u.kind, u.status, u.created_at, u.completed_at, u.amount, u.currency,
    u.title, u.subtitle, u.quantity, u.reference, u.cancelled_quantity,
    u.refund_status, u.refund_requested_at,
    u.service_fee,
    u.amount + u.service_fee AS total_paid
  FROM priced u
  WHERE p_cursor_created_at IS NULL
     OR u.created_at < p_cursor_created_at
     OR (u.created_at = p_cursor_created_at AND u.id < p_cursor_id)
  ORDER BY u.created_at DESC, u.id DESC
  LIMIT p_limit;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_user_transaction_history(timestamp with time zone, timestamp with time zone, timestamp with time zone, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_transaction_history(timestamp with time zone, timestamp with time zone, timestamp with time zone, uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_transaction_history(timestamp with time zone, timestamp with time zone, timestamp with time zone, uuid, integer) TO authenticated;
