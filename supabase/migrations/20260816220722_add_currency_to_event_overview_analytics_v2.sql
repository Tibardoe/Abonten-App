-- Adds a `currency` column to get_event_overview_analytics so the
-- dashboard's Gross Sales tile can label the amount correctly instead of
-- guessing/hardcoding a currency. Sourced from ticket_type.currency (the
-- only place currency is actually stored in this schema) rather than
-- event or ticket_checkout, neither of which carries it. Picks one
-- representative value for the event; this schema allows different
-- ticket types on the same event to record different currency strings,
-- but there is no cross-currency aggregation anywhere in the app today,
-- so this mirrors the existing (unenforced) assumption that one event
-- uses one currency.
--
-- A plain CREATE OR REPLACE can't add a column in the middle of an
-- existing RETURNS TABLE signature (Postgres: "cannot change return type
-- of existing function... Row type defined by OUT parameters is
-- different"), so the function is dropped and recreated instead.

DROP FUNCTION IF EXISTS public.get_event_overview_analytics(uuid);

CREATE FUNCTION public.get_event_overview_analytics(p_event_id uuid)
  RETURNS TABLE (
    event_title           text,
    starts_at             timestamp with time zone,
    ends_at               timestamp with time zone,
    require_registration  boolean,
    capacity               integer,
    currency                text,
    tickets_sold           bigint,
    tickets_cancelled      bigint,
    gross_sales             numeric,
    total_discount          numeric,
    promo_purchase_count    bigint,
    distinct_attendees      bigint,
    capacity_remaining      integer
  )
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.event e
    WHERE e.id = p_event_id AND e.organizer_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH ticket_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE t.status = 'active')    AS sold,
      COUNT(*) FILTER (WHERE t.status = 'cancelled') AS cancelled
    FROM public.ticket t
    JOIN public.ticket_type tt ON tt.id = t.ticket_type_id
    WHERE tt.event_id = p_event_id
  ),
  checkout_totals AS (
    SELECT
      COALESCE(SUM(tc.total_price), 0)                   AS gross,
      COALESCE(SUM(tc.discount), 0)                       AS discount,
      COUNT(*) FILTER (WHERE tc.promo_code IS NOT NULL)   AS promo_orders
    FROM public.ticket_checkout tc
    WHERE tc.event_id = p_event_id AND tc.status = 'paid'
  ),
  attendee_count AS (
    SELECT COUNT(DISTINCT a.user_id) AS distinct_users
    FROM public.attendance a
    WHERE a.event_id = p_event_id AND a.status = 'attending'
  ),
  currency_pick AS (
    SELECT tt.currency
    FROM public.ticket_type tt
    WHERE tt.event_id = p_event_id AND tt.currency IS NOT NULL
    LIMIT 1
  )
  SELECT
    e.title,
    e.starts_at,
    e.ends_at,
    e.require_registration,
    e.capacity,
    currency_pick.currency,
    ticket_counts.sold,
    ticket_counts.cancelled,
    checkout_totals.gross,
    checkout_totals.discount,
    checkout_totals.promo_orders,
    attendee_count.distinct_users,
    CASE WHEN e.capacity IS NOT NULL THEN e.capacity - ticket_counts.sold::integer ELSE NULL END
  FROM public.event e
  CROSS JOIN ticket_counts
  CROSS JOIN checkout_totals
  CROSS JOIN attendee_count
  LEFT JOIN currency_pick ON true
  WHERE e.id = p_event_id;
END;
$function$;
