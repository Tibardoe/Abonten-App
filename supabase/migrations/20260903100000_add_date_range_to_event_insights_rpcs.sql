-- Adds optional date-range filtering (p_start_date/p_end_date, both
-- timestamptz, both NULL by default) to the five Event Insights RPCs, so
-- the Event Insights page can offer the same period filter the Organizer
-- Dashboard already has (see src/utils/organizerDashboardDateRange.ts).
-- NULL on either bound means "no bound" -- calling these with just
-- p_event_id (as every existing caller does today) is unchanged,
-- lifetime-to-date behavior.
--
-- Adding a parameter changes a function's signature/identity, so
-- CREATE OR REPLACE would create a second overload alongside the old
-- 1-argument version rather than truly replacing it (same reasoning as
-- 20260816220722's drop-then-create for a RETURNS TABLE change) -- each
-- function is dropped first to avoid leaving a stale duplicate overload.
-- Neither function had an explicit GRANT statement of its own (relying on
-- the default PUBLIC EXECUTE grant new functions get), so none is needed
-- after recreating them either.
--
-- Date semantics: "when did this activity happen" -- ticket issuance
-- (ticket.issued_at) and checkout completion (COALESCE(ticket_checkout.
-- completed_at, created_at), matching get_event_sales_timeline's existing
-- convention) -- not event/occurrence dates. attendance.created_at is
-- `timestamp without time zone`; compared here against a `timestamptz`
-- bound, Postgres interprets it in the session timezone, which is UTC on
-- this project -- consistent with how the data is actually written.
-- get_event_returning_attendee_stats only date-filters the *current*
-- event's attendee set; whether that attendee has EVER attended another
-- event by the same organizer is intentionally left unbounded (a lifetime
-- fact, not a period-scoped one).

DROP FUNCTION IF EXISTS public.get_event_overview_analytics(uuid);

CREATE FUNCTION public.get_event_overview_analytics(
  p_event_id uuid,
  p_start_date timestamp with time zone DEFAULT NULL,
  p_end_date   timestamp with time zone DEFAULT NULL
)
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
      AND (p_start_date IS NULL OR t.issued_at >= p_start_date)
      AND (p_end_date IS NULL OR t.issued_at <= p_end_date)
  ),
  checkout_totals AS (
    SELECT
      COALESCE(SUM(tc.total_price), 0)                   AS gross,
      COALESCE(SUM(tc.discount), 0)                       AS discount,
      COUNT(*) FILTER (WHERE tc.promo_code IS NOT NULL)   AS promo_orders
    FROM public.ticket_checkout tc
    WHERE tc.event_id = p_event_id AND tc.status = 'paid'
      AND (p_start_date IS NULL OR COALESCE(tc.completed_at, tc.created_at) >= p_start_date)
      AND (p_end_date IS NULL OR COALESCE(tc.completed_at, tc.created_at) <= p_end_date)
  ),
  attendee_count AS (
    SELECT COUNT(DISTINCT a.user_id) AS distinct_users
    FROM public.attendance a
    WHERE a.event_id = p_event_id AND a.status = 'attending'
      AND (p_start_date IS NULL OR a.created_at >= p_start_date)
      AND (p_end_date IS NULL OR a.created_at <= p_end_date)
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

DROP FUNCTION IF EXISTS public.get_event_ticket_type_analytics(uuid);

CREATE FUNCTION public.get_event_ticket_type_analytics(
  p_event_id uuid,
  p_start_date timestamp with time zone DEFAULT NULL,
  p_end_date   timestamp with time zone DEFAULT NULL
)
  RETURNS TABLE (
    ticket_type_id    uuid,
    type               text,
    price              numeric,
    currency           text,
    quantity_capacity  integer,
    sold               bigint,
    cancelled          bigint,
    percent_sold       numeric,
    revenue            numeric,
    discount           numeric
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
  WITH sold_counts AS (
    SELECT
      t.ticket_type_id,
      COUNT(*) FILTER (WHERE t.status = 'active')    AS sold,
      COUNT(*) FILTER (WHERE t.status = 'cancelled') AS cancelled
    FROM public.ticket t
    WHERE t.ticket_type_id IN (SELECT id FROM public.ticket_type WHERE event_id = p_event_id)
      AND (p_start_date IS NULL OR t.issued_at >= p_start_date)
      AND (p_end_date IS NULL OR t.issued_at <= p_end_date)
    GROUP BY t.ticket_type_id
  ),
  revenue_totals AS (
    SELECT
      tc.ticket_type_id,
      COALESCE(SUM(tc.total_price), 0) AS revenue,
      COALESCE(SUM(tc.discount), 0)    AS discount
    FROM public.ticket_checkout tc
    WHERE tc.event_id = p_event_id AND tc.status = 'paid'
      AND (p_start_date IS NULL OR COALESCE(tc.completed_at, tc.created_at) >= p_start_date)
      AND (p_end_date IS NULL OR COALESCE(tc.completed_at, tc.created_at) <= p_end_date)
    GROUP BY tc.ticket_type_id
  )
  SELECT
    tt.id,
    tt.type,
    tt.price,
    tt.currency,
    tt.quantity,
    COALESCE(sold_counts.sold, 0),
    COALESCE(sold_counts.cancelled, 0),
    CASE WHEN tt.quantity IS NOT NULL AND tt.quantity > 0
      THEN ROUND(100.0 * COALESCE(sold_counts.sold, 0) / tt.quantity, 1)
      ELSE NULL
    END,
    COALESCE(revenue_totals.revenue, 0),
    COALESCE(revenue_totals.discount, 0)
  FROM public.ticket_type tt
  LEFT JOIN sold_counts ON sold_counts.ticket_type_id = tt.id
  LEFT JOIN revenue_totals ON revenue_totals.ticket_type_id = tt.id
  WHERE tt.event_id = p_event_id
  ORDER BY tt.created_at;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_event_promo_analytics(uuid);

CREATE FUNCTION public.get_event_promo_analytics(
  p_event_id uuid,
  p_start_date timestamp with time zone DEFAULT NULL,
  p_end_date   timestamp with time zone DEFAULT NULL
)
  RETURNS TABLE (
    promo_code        text,
    orders             bigint,
    units_discounted   bigint,
    total_discount     numeric,
    total_revenue      numeric
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
  SELECT
    tc.promo_code,
    COUNT(*),
    COALESCE(SUM(tc.discounted_units), 0),
    COALESCE(SUM(tc.discount), 0),
    COALESCE(SUM(tc.total_price), 0)
  FROM public.ticket_checkout tc
  WHERE tc.event_id = p_event_id
    AND tc.status = 'paid'
    AND tc.promo_code IS NOT NULL
    AND (p_start_date IS NULL OR COALESCE(tc.completed_at, tc.created_at) >= p_start_date)
    AND (p_end_date IS NULL OR COALESCE(tc.completed_at, tc.created_at) <= p_end_date)
  GROUP BY tc.promo_code
  ORDER BY COALESCE(SUM(tc.discount), 0) DESC;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_event_date_analytics(uuid);

CREATE FUNCTION public.get_event_date_analytics(
  p_event_id uuid,
  p_start_date timestamp with time zone DEFAULT NULL,
  p_end_date   timestamp with time zone DEFAULT NULL
)
  RETURNS TABLE (
    occurrence_id      uuid,
    starts_at           timestamp with time zone,
    ends_at             timestamp with time zone,
    tickets_sold        bigint,
    tickets_cancelled   bigint,
    revenue             numeric
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
      t.occurrence_id,
      COUNT(*) FILTER (WHERE t.status = 'active')    AS sold,
      COUNT(*) FILTER (WHERE t.status = 'cancelled') AS cancelled
    FROM public.ticket t
    JOIN public.ticket_type tt ON tt.id = t.ticket_type_id
    WHERE tt.event_id = p_event_id
      AND (p_start_date IS NULL OR t.issued_at >= p_start_date)
      AND (p_end_date IS NULL OR t.issued_at <= p_end_date)
    GROUP BY t.occurrence_id
  ),
  revenue_totals AS (
    SELECT
      tc.occurrence_id,
      COALESCE(SUM(tc.total_price), 0) AS revenue
    FROM public.ticket_checkout tc
    WHERE tc.event_id = p_event_id AND tc.status = 'paid'
      AND (p_start_date IS NULL OR COALESCE(tc.completed_at, tc.created_at) >= p_start_date)
      AND (p_end_date IS NULL OR COALESCE(tc.completed_at, tc.created_at) <= p_end_date)
    GROUP BY tc.occurrence_id
  )
  SELECT
    eo.id,
    eo.starts_at,
    eo.ends_at,
    COALESCE(ticket_counts.sold, 0),
    COALESCE(ticket_counts.cancelled, 0),
    COALESCE(revenue_totals.revenue, 0)
  FROM public.event_occurrence eo
  LEFT JOIN ticket_counts ON ticket_counts.occurrence_id = eo.id
  LEFT JOIN revenue_totals ON revenue_totals.occurrence_id = eo.id
  WHERE eo.event_id = p_event_id

  UNION ALL

  SELECT
    NULL::uuid,
    NULL::timestamp with time zone,
    NULL::timestamp with time zone,
    COALESCE(ticket_counts.sold, 0),
    COALESCE(ticket_counts.cancelled, 0),
    COALESCE(revenue_totals.revenue, 0)
  FROM ticket_counts
  FULL JOIN revenue_totals ON revenue_totals.occurrence_id = ticket_counts.occurrence_id
  WHERE COALESCE(ticket_counts.occurrence_id, revenue_totals.occurrence_id) IS NULL
    AND (COALESCE(ticket_counts.sold, 0) > 0
      OR COALESCE(ticket_counts.cancelled, 0) > 0
      OR COALESCE(revenue_totals.revenue, 0) > 0)

  ORDER BY starts_at NULLS LAST;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_event_returning_attendee_stats(uuid);

CREATE FUNCTION public.get_event_returning_attendee_stats(
  p_event_id uuid,
  p_start_date timestamp with time zone DEFAULT NULL,
  p_end_date   timestamp with time zone DEFAULT NULL
)
  RETURNS TABLE (
    returning_count    bigint,
    first_time_count   bigint
  )
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
DECLARE
  v_organizer_id uuid;
BEGIN
  SELECT e.organizer_id INTO v_organizer_id
  FROM public.event e
  WHERE e.id = p_event_id AND e.organizer_id = auth.uid();

  IF v_organizer_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH current_attendees AS (
    SELECT DISTINCT a.user_id
    FROM public.attendance a
    WHERE a.event_id = p_event_id AND a.status = 'attending'
      AND (p_start_date IS NULL OR a.created_at >= p_start_date)
      AND (p_end_date IS NULL OR a.created_at <= p_end_date)
  ),
  returning_attendees AS (
    SELECT ca.user_id
    FROM current_attendees ca
    WHERE EXISTS (
      SELECT 1
      FROM public.attendance a2
      JOIN public.event e2 ON e2.id = a2.event_id
      WHERE a2.user_id = ca.user_id
        AND a2.event_id <> p_event_id
        AND a2.status = 'attending'
        AND e2.organizer_id = v_organizer_id
    )
  )
  SELECT
    (SELECT COUNT(*) FROM returning_attendees),
    (SELECT COUNT(*) FROM current_attendees) - (SELECT COUNT(*) FROM returning_attendees);
END;
$function$;
