-- Follow-ups to the customer-paid-service-fee change (20260903130000):
--
-- 1. record_fee_refund_adjustment: write processing_cost = 0 (a known value),
--    not NULL. Paystack does not return its original charge fee on a refund
--    and reports no separate per-refund processing cost, so the refund
--    itself genuinely incurs no payment-processing cost. Recording 0 (vs.
--    NULL "unknown") lets SUM(processing_cost) / SUM(net_revenue) across
--    platform_fee_entry reconcile without special-casing the adjustment rows.
--
-- 2. get_user_transaction_history / get_user_transaction_summary: the buyer's
--    /transactions view sourced amounts from ticket_checkout.total_price,
--    which is fee-exclusive. Add the customer-paid service fee and the true
--    total paid, derived from transaction.amount (what Paystack actually
--    captured) proportioned by this checkout row's share of the charge — so
--    a multi-checkout basket payment splits correctly, and legacy sales
--    (whatever fee rate applied at the time) stay exact without assuming a
--    rate. Both functions stay caller-rights (not SECURITY DEFINER): every
--    branch is already scoped to auth.uid(), and transaction is buyer-
--    readable under its own RLS.

-- ---------------------------------------------------------------------
-- 1. record_fee_refund_adjustment
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_fee_refund_adjustment(p_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fee_row    public.platform_fee_entry%ROWTYPE;
  v_refundable numeric(12,2);
BEGIN
  SELECT * INTO v_fee_row
  FROM public.platform_fee_entry
  WHERE transaction_id = p_transaction_id AND entry_type = 'fee';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_refundable := public.get_transaction_refundable_amount(p_transaction_id);

  INSERT INTO public.platform_fee_entry (
    transaction_id, event_id, entry_type,
    ticket_revenue, service_fee, total_customer_payment,
    processing_cost, net_revenue, fee_rate, currency
  ) VALUES (
    p_transaction_id,
    v_fee_row.event_id,
    'fee_refund_adjustment',
    -1 * v_refundable,
    0,
    -1 * v_refundable,
    0,   -- Paystack keeps its charge fee on a refund and reports no separate
         -- per-refund processing cost: the refund itself costs nothing to
         -- process. The original charge's processing cost stays on the 'fee'
         -- row and is unaffected.
    0,   -- Abonten's revenue is unchanged by a refund (the service fee is
         -- retained), so this adjustment's net-revenue impact is 0.
    v_fee_row.fee_rate,
    v_fee_row.currency
  )
  ON CONFLICT (transaction_id) WHERE entry_type = 'fee_refund_adjustment' DO NOTHING;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_fee_refund_adjustment(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_fee_refund_adjustment(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_fee_refund_adjustment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_fee_refund_adjustment(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 2a. get_user_transaction_history — adds service_fee + total_paid.
-- Return type gains columns, so DROP + CREATE (CREATE OR REPLACE cannot
-- change a function's return type).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_user_transaction_history(timestamp with time zone, timestamp with time zone, timestamp with time zone, uuid, integer);

CREATE FUNCTION public.get_user_transaction_history(
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
        -- all tickets of one checkout share one transaction_id (generateTicket.ts);
        -- pick any non-null one. (No max()/min() for uuid in PG15.)
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

-- ---------------------------------------------------------------------
-- 2b. get_user_transaction_summary — amount_spent becomes fee-inclusive
-- (what the customer actually paid). Signature unchanged, so CREATE OR
-- REPLACE is fine.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_transaction_summary(
  p_start timestamp with time zone,
  p_end   timestamp with time zone
)
RETURNS TABLE(
  currency            text,
  amount_spent        numeric,
  total_transactions  bigint,
  successful_count    bigint,
  pending_count       bigint,
  failed_count        bigint,
  tickets_purchased   bigint,
  subscriptions_count bigint
)
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  WITH my_tc AS (
    SELECT tc.*
    FROM public.ticket_checkout tc
    WHERE tc.user_id = auth.uid()
      AND (p_start IS NULL OR (tc.created_at AT TIME ZONE 'UTC') >= p_start)
      AND (p_end   IS NULL OR (tc.created_at AT TIME ZONE 'UTC') <= p_end)
  ),
  my_sc AS (
    SELECT sc.*
    FROM public.subscription_checkout sc
    WHERE sc.user_id = auth.uid()
      AND (p_start IS NULL OR sc.created_at >= p_start)
      AND (p_end   IS NULL OR sc.created_at <= p_end)
  ),
  counts AS (
    SELECT
      (SELECT COUNT(*) FROM my_tc) + (SELECT COUNT(*) FROM my_sc) AS total_transactions,
      (SELECT COUNT(*) FROM my_tc WHERE status = 'paid')
        + (SELECT COUNT(*) FROM my_sc WHERE status = 'paid')      AS successful_count,
      (SELECT COUNT(*) FROM my_tc WHERE status = 'pending')
        + (SELECT COUNT(*) FROM my_sc WHERE status = 'pending')   AS pending_count,
      (SELECT COUNT(*) FROM my_tc WHERE status = 'failed')
        + (SELECT COUNT(*) FROM my_sc WHERE status = 'failed')    AS failed_count,
      (SELECT COALESCE(SUM(quantity), 0) FROM my_tc WHERE status = 'paid') AS tickets_purchased,
      (SELECT COUNT(*) FROM my_sc WHERE status = 'paid')          AS subscriptions_count
  ),
  money_by_currency AS (
    SELECT
      COALESCE(tt.currency, 'GHS') AS currency,
      SUM(
        mtc.total_price
        + CASE
            WHEN txn.id IS NULL OR txn.amount IS NULL THEN 0::numeric
            ELSE GREATEST(
              round(
                txn.amount
                  * (mtc.total_price / NULLIF((
                      SELECT SUM(tc2.total_price)
                      FROM public.ticket_checkout tc2
                      WHERE tc2.id IN (
                        SELECT DISTINCT t2.ticket_checkout_id
                        FROM public.ticket t2
                        WHERE t2.transaction_id = txn.id
                          AND t2.ticket_checkout_id IS NOT NULL
                      )
                    ), 0))
                  - mtc.total_price,
                2),
              0::numeric
            )
          END
      ) AS spent
    FROM my_tc mtc
    LEFT JOIN public.ticket_type tt ON tt.id = mtc.ticket_type_id
    LEFT JOIN LATERAL (
      SELECT tr.id, tr.amount
      FROM public.ticket t
      JOIN public.transaction tr ON tr.id = t.transaction_id
      WHERE t.ticket_checkout_id = mtc.id
      LIMIT 1
    ) txn ON true
    WHERE mtc.status = 'paid'
    GROUP BY COALESCE(tt.currency, 'GHS')

    UNION ALL

    SELECT 'GHS'::text, COALESCE(SUM(msc.total_price), 0)
    FROM my_sc msc
    WHERE msc.status = 'paid'
  ),
  money_rows AS (
    SELECT money_by_currency.currency, SUM(money_by_currency.spent) AS amount_spent
    FROM money_by_currency
    GROUP BY money_by_currency.currency
  )
  SELECT mr.currency, mr.amount_spent, c.total_transactions, c.successful_count,
         c.pending_count, c.failed_count, c.tickets_purchased, c.subscriptions_count
  FROM money_rows mr
  CROSS JOIN counts c;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_user_transaction_summary(timestamp with time zone, timestamp with time zone) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_transaction_summary(timestamp with time zone, timestamp with time zone) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_transaction_summary(timestamp with time zone, timestamp with time zone) TO authenticated;
