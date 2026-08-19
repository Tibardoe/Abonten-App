-- Extends get_user_transaction_history with per-ticket cancellation/refund
-- info, computed at the correct granularity now that ticket.ticket_checkout_id
-- exists (see 20260819100000_ticket_checkout_link.sql): cancelled_quantity
-- (how many of this line's tickets are cancelled) and refund_status (the
-- linked transaction's status for those cancelled tickets — every ticket
-- generated from one checkout line always shares the same transaction_id,
-- since generateTicket.ts issues them together from one
-- finalizePaystackPayment() call, so there's no ambiguity to aggregate over).
-- Both are NULL for the subscription branch (no per-unit cancellation there).
-- Return type is changing, so the function must be dropped and recreated
-- rather than CREATE OR REPLACE'd.

DROP FUNCTION IF EXISTS public.get_user_transaction_history(timestamptz, timestamptz, timestamptz, uuid, int);

CREATE FUNCTION public.get_user_transaction_history(
  p_start              timestamptz,
  p_end                timestamptz,
  p_cursor_created_at  timestamptz,
  p_cursor_id          uuid,
  p_limit              int
)
  RETURNS TABLE (
    id                 uuid,
    kind               text,
    status             text,
    created_at         timestamptz,
    completed_at       timestamptz,
    amount             numeric,
    currency           text,
    title              text,
    subtitle           text,
    quantity           integer,
    reference          uuid,
    cancelled_quantity integer,
    refund_status      text
  )
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
BEGIN
  RETURN QUERY
  WITH unified AS (
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
      tix.refund_status
    FROM public.ticket_checkout tc
    LEFT JOIN public.ticket_type tt ON tt.id = tc.ticket_type_id
    LEFT JOIN public.event e ON e.id = tc.event_id
    LEFT JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE t.status = 'cancelled')::integer AS cancelled_quantity,
        (array_agg(tr.status ORDER BY t.updated_at DESC NULLS LAST) FILTER (WHERE t.status = 'cancelled'))[1] AS refund_status
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
      NULL::text
    FROM public.subscription_checkout sc
    WHERE sc.user_id = auth.uid()
      AND (p_start IS NULL OR sc.created_at >= p_start)
      AND (p_end   IS NULL OR sc.created_at <= p_end)
  )
  SELECT *
  FROM unified u
  WHERE p_cursor_created_at IS NULL
     OR u.created_at < p_cursor_created_at
     OR (u.created_at = p_cursor_created_at AND u.id < p_cursor_id)
  ORDER BY u.created_at DESC, u.id DESC
  LIMIT p_limit;
END;
$function$;
