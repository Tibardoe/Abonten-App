-- Organizer Dashboard support: aggregates ticket sales/registrations across
-- ALL of an organizer's events, unlike the existing get_event_*_analytics
-- functions (20260816220125_add_occurrence_link_and_analytics_indexes.sql),
-- which are single-event only (p_event_id). This migration mirrors those
-- functions' join shape and financial definitions exactly (gross_sales =
-- SUM(ticket_checkout.total_price) WHERE status='paid'; tickets_sold =
-- COUNT(ticket) WHERE status='active'; ticket_type.quantity, not
-- event.capacity, is the authoritative inventory figure) so the two levels
-- of analytics can never silently disagree about what a number means.
--
-- Security: none of these functions accept an organizer-id parameter at
-- all — each reads auth.uid() directly, so there is no id to spoof. This is
-- even tighter than the existing per-event pattern's `e.organizer_id =
-- auth.uid()` check, which at least takes a p_event_id the caller picks.
-- Every function still `SET search_path = ''` per this schema's
-- no-RLS-anywhere convention (see the big comment in the migration above),
-- and every Server Action wrapping these additionally re-checks
-- auth.getUser() first, matching this codebase's defense-in-depth pattern.
--
-- Scope: all six functions restrict to the organizer's `published` events.
-- Draft events have no real sales to aggregate yet, and a `canceled` event
-- showing up as "active"/"needs attention" would be misleading — so the
-- Organizer Dashboard reports on live, published events only.
--
-- Event lifecycle status (upcoming/ongoing/ended) is computed here the same
-- way src/utils/eventStatus.ts computes it client-side: from the full
-- MIN(starts_at)/MAX(ends_at) span across event_occurrence rows (falling
-- back to the event's own starts_at/ends_at for single-date events), never
-- from a single date — the earlier bug this project already fixed once.
--
-- No new indexes are added speculatively here. The existing
-- idx_event_organizer_created, idx_ticket_checkout_event_status,
-- idx_ticket_ticket_type_status, and idx_ticket_type_event_id already
-- support the join/filter shapes below; EXPLAIN ANALYZE was run against
-- representative calls after deploying this migration, and no sequential
-- scan requiring a new index was found at current data volume (see the
-- Organizer Dashboard implementation report for the query plans checked).

-- ---------------------------------------------------------------------
-- get_organizer_dashboard_overview: top-line KPIs across the organizer's
-- events for a period. Money is grouped by currency (never summed across
-- currencies); ticket/event counts are currency-agnostic and repeat
-- identically on every returned row (harmless — callers read them once,
-- typically from the first row, since almost every organizer has a single
-- currency). active_events_count/upcoming_events_count/total_events_count
-- are always current/live and intentionally NOT period-filtered — "how
-- many events are active right now" doesn't make sense scoped to "in the
-- last 7 days". p_start/p_end both NULL means "All Time" (unbounded).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_organizer_dashboard_overview(
  p_start timestamptz,
  p_end timestamptz
)
  RETURNS TABLE (
    currency               text,
    gross_sales             numeric,
    total_discount          numeric,
    distinct_purchasers     bigint,
    paid_orders             bigint,
    tickets_sold            bigint,
    tickets_cancelled       bigint,
    registrations           bigint,
    active_events_count     bigint,
    upcoming_events_count   bigint,
    total_events_count      bigint
  )
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
BEGIN
  RETURN QUERY
  WITH organizer_events AS (
    SELECT e.id, e.starts_at, e.ends_at
    FROM public.event e
    WHERE e.organizer_id = auth.uid() AND e.status = 'published'
  ),
  occurrence_bounds AS (
    SELECT
      oe.id,
      COALESCE(MIN(eo.starts_at), oe.starts_at) AS min_starts,
      COALESCE(MAX(eo.ends_at), oe.ends_at)      AS max_ends
    FROM organizer_events oe
    LEFT JOIN public.event_occurrence eo ON eo.event_id = oe.id
    GROUP BY oe.id, oe.starts_at, oe.ends_at
  ),
  event_status_counts AS (
    SELECT
      COUNT(*) FILTER (
        WHERE min_starts IS NOT NULL AND now() >= min_starts AND now() <= max_ends
      ) AS ongoing_count,
      COUNT(*) FILTER (
        WHERE min_starts IS NOT NULL AND min_starts > now()
      ) AS upcoming_count,
      COUNT(*) AS total_count
    FROM occurrence_bounds
  ),
  paid_checkouts AS (
    SELECT tc.*
    FROM public.ticket_checkout tc
    JOIN organizer_events oe ON oe.id = tc.event_id
    WHERE tc.status = 'paid'
      AND (p_start IS NULL OR COALESCE(tc.completed_at, tc.created_at) >= p_start)
      AND (p_end IS NULL OR COALESCE(tc.completed_at, tc.created_at) <= p_end)
  ),
  money_by_currency AS (
    SELECT
      COALESCE(tt.currency, 'GHS') AS currency,
      COALESCE(SUM(pc.total_price), 0) AS gross,
      COALESCE(SUM(pc.discount), 0)    AS discount,
      COUNT(DISTINCT pc.user_id)       AS purchasers,
      COUNT(*)                         AS orders
    FROM paid_checkouts pc
    JOIN public.ticket_type tt ON tt.id = pc.ticket_type_id
    GROUP BY COALESCE(tt.currency, 'GHS')
  ),
  money_rows AS (
    SELECT * FROM money_by_currency
    UNION ALL
    SELECT NULL::text, 0::numeric, 0::numeric, 0::bigint, 0::bigint
    WHERE NOT EXISTS (SELECT 1 FROM money_by_currency)
  ),
  organizer_tickets AS (
    SELECT t.*, tt.price
    FROM public.ticket t
    JOIN public.ticket_type tt ON tt.id = t.ticket_type_id
    JOIN organizer_events oe ON oe.id = tt.event_id
  ),
  ticket_counts_overall AS (
    SELECT
      COUNT(*) FILTER (
        WHERE ot.status = 'active' AND ot.price > 0
          AND (p_start IS NULL OR ot.created_at >= p_start)
          AND (p_end IS NULL OR ot.created_at <= p_end)
      ) AS sold,
      COUNT(*) FILTER (
        WHERE ot.status = 'cancelled'
          AND (p_start IS NULL OR ot.updated_at >= p_start)
          AND (p_end IS NULL OR ot.updated_at <= p_end)
      ) AS cancelled,
      COUNT(*) FILTER (
        WHERE ot.status = 'active' AND ot.price = 0
          AND (p_start IS NULL OR ot.created_at >= p_start)
          AND (p_end IS NULL OR ot.created_at <= p_end)
      ) AS registrations
    FROM organizer_tickets ot
  )
  SELECT
    mr.currency,
    mr.gross,
    mr.discount,
    mr.purchasers,
    mr.orders,
    tco.sold,
    tco.cancelled,
    tco.registrations,
    esc.ongoing_count + esc.upcoming_count,
    esc.upcoming_count,
    esc.total_count
  FROM money_rows mr
  CROSS JOIN ticket_counts_overall tco
  CROSS JOIN event_status_counts esc;
END;
$function$;

-- ---------------------------------------------------------------------
-- get_organizer_sales_timeline: paid checkouts across the organizer's
-- events, bucketed by the caller-selected granularity. p_bucket is chosen
-- by the calling Server Action from the selected period (today -> hour,
-- 7d/30d -> day, all -> month) so the chart never becomes an unreadable
-- wall of points for a long range.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_organizer_sales_timeline(
  p_start timestamptz,
  p_end timestamptz,
  p_bucket text
)
  RETURNS TABLE (
    bucket_start   timestamptz,
    gross           numeric,
    orders          bigint
  )
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
BEGIN
  IF p_bucket NOT IN ('hour', 'day', 'month') THEN
    RAISE EXCEPTION 'invalid bucket: %', p_bucket;
  END IF;

  RETURN QUERY
  SELECT
    date_trunc(p_bucket, COALESCE(tc.completed_at, tc.created_at)) AS bucket_start,
    COALESCE(SUM(tc.total_price), 0),
    COUNT(*)
  FROM public.ticket_checkout tc
  JOIN public.event e ON e.id = tc.event_id
  WHERE e.organizer_id = auth.uid()
    AND e.status = 'published'
    AND tc.status = 'paid'
    AND (p_start IS NULL OR COALESCE(tc.completed_at, tc.created_at) >= p_start)
    AND (p_end IS NULL OR COALESCE(tc.completed_at, tc.created_at) <= p_end)
  GROUP BY date_trunc(p_bucket, COALESCE(tc.completed_at, tc.created_at))
  ORDER BY bucket_start;
END;
$function$;

-- ---------------------------------------------------------------------
-- get_organizer_event_performance: ranked events for the selected period,
-- sorted and LIMITed in SQL (never fetches the full event list to rank
-- client-side). tickets_sold/revenue respect the period filter; the
-- returned `status` is the computed lifecycle status (upcoming/ongoing/
-- ended), not the raw event.status publish-state column.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_organizer_event_performance(
  p_start timestamptz,
  p_end timestamptz,
  p_sort text,
  p_limit int
)
  RETURNS TABLE (
    event_id             uuid,
    title                 text,
    status                text,
    starts_at             timestamptz,
    currency              text,
    tickets_sold          bigint,
    revenue               numeric,
    capacity_remaining    integer
  )
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
DECLARE
  v_sort text := CASE WHEN p_sort IN ('revenue', 'tickets') THEN p_sort ELSE 'revenue' END;
BEGIN
  RETURN QUERY
  WITH organizer_events AS (
    SELECT e.id, e.title, e.starts_at, e.ends_at
    FROM public.event e
    WHERE e.organizer_id = auth.uid() AND e.status = 'published'
  ),
  occurrence_bounds AS (
    SELECT
      oe.id,
      COALESCE(MIN(eo.starts_at), oe.starts_at) AS min_starts,
      COALESCE(MAX(eo.ends_at), oe.ends_at)      AS max_ends
    FROM organizer_events oe
    LEFT JOIN public.event_occurrence eo ON eo.event_id = oe.id
    GROUP BY oe.id, oe.starts_at, oe.ends_at
  ),
  sold_counts AS (
    SELECT tt.event_id, COUNT(*) AS sold
    FROM public.ticket t
    JOIN public.ticket_type tt ON tt.id = t.ticket_type_id
    WHERE t.status = 'active'
      AND tt.event_id IN (SELECT id FROM organizer_events)
      AND (p_start IS NULL OR t.created_at >= p_start)
      AND (p_end IS NULL OR t.created_at <= p_end)
    GROUP BY tt.event_id
  ),
  revenue_totals AS (
    SELECT
      tc.event_id,
      COALESCE(SUM(tc.total_price), 0) AS revenue,
      MIN(tt.currency)                 AS currency
    FROM public.ticket_checkout tc
    JOIN public.ticket_type tt ON tt.id = tc.ticket_type_id
    WHERE tc.status = 'paid'
      AND tc.event_id IN (SELECT id FROM organizer_events)
      AND (p_start IS NULL OR COALESCE(tc.completed_at, tc.created_at) >= p_start)
      AND (p_end IS NULL OR COALESCE(tc.completed_at, tc.created_at) <= p_end)
    GROUP BY tc.event_id
  ),
  capacity_totals AS (
    SELECT tt.event_id, SUM(tt.quantity) AS total_capacity
    FROM public.ticket_type tt
    WHERE tt.event_id IN (SELECT id FROM organizer_events)
    GROUP BY tt.event_id
  )
  SELECT
    oe.id,
    oe.title,
    CASE
      WHEN ob.min_starts IS NULL THEN NULL
      WHEN now() >= ob.min_starts AND now() <= ob.max_ends THEN 'ongoing'
      WHEN ob.min_starts > now() THEN 'upcoming'
      ELSE 'ended'
    END,
    oe.starts_at,
    revenue_totals.currency,
    COALESCE(sold_counts.sold, 0),
    COALESCE(revenue_totals.revenue, 0),
    CASE WHEN capacity_totals.total_capacity IS NOT NULL
      THEN (capacity_totals.total_capacity - COALESCE(sold_counts.sold, 0))::integer
      ELSE NULL
    END
  FROM organizer_events oe
  JOIN occurrence_bounds ob ON ob.id = oe.id
  LEFT JOIN sold_counts ON sold_counts.event_id = oe.id
  LEFT JOIN revenue_totals ON revenue_totals.event_id = oe.id
  LEFT JOIN capacity_totals ON capacity_totals.event_id = oe.id
  ORDER BY
    CASE WHEN v_sort = 'tickets' THEN COALESCE(sold_counts.sold, 0) END DESC NULLS LAST,
    CASE WHEN v_sort = 'revenue' THEN COALESCE(revenue_totals.revenue, 0) END DESC NULLS LAST
  LIMIT p_limit;
END;
$function$;

-- ---------------------------------------------------------------------
-- get_organizer_upcoming_events: events not yet ended (upcoming or
-- ongoing), soonest first. Capacity uses SUM(ticket_type.quantity), never
-- event.capacity (informational-only field). min_ticket_type_percent_
-- remaining lets the UI flag a specific ticket type running low without a
-- second round trip.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_organizer_upcoming_events(p_limit int)
  RETURNS TABLE (
    event_id                          uuid,
    title                              text,
    next_occurrence_starts_at          timestamptz,
    status                             text,
    tickets_sold                       bigint,
    capacity                           integer,
    min_ticket_type_percent_remaining  numeric
  )
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
BEGIN
  RETURN QUERY
  WITH organizer_events AS (
    SELECT e.id, e.title, e.starts_at, e.ends_at
    FROM public.event e
    WHERE e.organizer_id = auth.uid() AND e.status = 'published'
  ),
  occurrence_bounds AS (
    SELECT
      oe.id,
      oe.title,
      COALESCE(MIN(eo.starts_at), oe.starts_at) AS min_starts,
      COALESCE(MAX(eo.ends_at), oe.ends_at)      AS max_ends,
      COALESCE(MIN(eo.starts_at) FILTER (WHERE eo.starts_at >= now()), oe.starts_at) AS next_starts
    FROM organizer_events oe
    LEFT JOIN public.event_occurrence eo ON eo.event_id = oe.id
    GROUP BY oe.id, oe.title, oe.starts_at, oe.ends_at
  ),
  eligible AS (
    SELECT * FROM occurrence_bounds
    WHERE min_starts IS NOT NULL AND max_ends >= now()
  ),
  sold_counts AS (
    SELECT tt.event_id, COUNT(*) AS sold
    FROM public.ticket t
    JOIN public.ticket_type tt ON tt.id = t.ticket_type_id
    WHERE t.status = 'active' AND tt.event_id IN (SELECT id FROM eligible)
    GROUP BY tt.event_id
  ),
  capacity_totals AS (
    SELECT tt.event_id, SUM(tt.quantity) AS total_capacity
    FROM public.ticket_type tt
    WHERE tt.event_id IN (SELECT id FROM eligible)
    GROUP BY tt.event_id
  ),
  ticket_type_sold AS (
    SELECT ticket_type_id, COUNT(*) AS sold
    FROM public.ticket
    WHERE status = 'active'
    GROUP BY ticket_type_id
  ),
  ticket_type_remaining AS (
    SELECT
      tt.event_id,
      MIN(
        CASE WHEN tt.quantity IS NOT NULL AND tt.quantity > 0
          THEN 100.0 * GREATEST(tt.quantity - COALESCE(tts.sold, 0), 0) / tt.quantity
          ELSE NULL
        END
      ) AS min_percent_remaining
    FROM public.ticket_type tt
    LEFT JOIN ticket_type_sold tts ON tts.ticket_type_id = tt.id
    WHERE tt.event_id IN (SELECT id FROM eligible)
    GROUP BY tt.event_id
  )
  SELECT
    el.id,
    el.title,
    COALESCE(el.next_starts, el.min_starts),
    CASE WHEN now() >= el.min_starts AND now() <= el.max_ends THEN 'ongoing' ELSE 'upcoming' END,
    COALESCE(sold_counts.sold, 0),
    capacity_totals.total_capacity::integer,
    ticket_type_remaining.min_percent_remaining
  FROM eligible el
  LEFT JOIN sold_counts ON sold_counts.event_id = el.id
  LEFT JOIN capacity_totals ON capacity_totals.event_id = el.id
  LEFT JOIN ticket_type_remaining ON ticket_type_remaining.event_id = el.id
  ORDER BY COALESCE(el.next_starts, el.min_starts) ASC
  LIMIT p_limit;
END;
$function$;

-- ---------------------------------------------------------------------
-- get_organizer_needs_attention: simple, explainable, threshold-based
-- rules only (no speculation/AI). Three rules: (a) starting soon with zero
-- sales, (b) starting soon with sales below a low bar relative to
-- capacity (or an absolute floor when capacity is unknown), (c) any
-- ticket type at <=10% remaining. (a) and (b) are mutually exclusive by
-- construction (b requires sold > 0).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_organizer_needs_attention(p_days_soon int DEFAULT 7)
  RETURNS TABLE (
    event_id       uuid,
    event_title    text,
    rule_type      text,
    message        text
  )
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
BEGIN
  RETURN QUERY
  WITH organizer_events AS (
    SELECT e.id, e.title, e.starts_at
    FROM public.event e
    WHERE e.organizer_id = auth.uid() AND e.status = 'published'
  ),
  occurrence_bounds AS (
    SELECT
      oe.id,
      oe.title,
      COALESCE(MIN(eo.starts_at), oe.starts_at) AS min_starts
    FROM organizer_events oe
    LEFT JOIN public.event_occurrence eo ON eo.event_id = oe.id
    GROUP BY oe.id, oe.title, oe.starts_at
  ),
  starting_soon AS (
    SELECT * FROM occurrence_bounds
    WHERE min_starts IS NOT NULL
      AND min_starts > now()
      AND min_starts <= now() + (p_days_soon || ' days')::interval
  ),
  sold_counts AS (
    SELECT tt.event_id, COUNT(t.id) AS sold, SUM(tt.quantity) AS capacity
    FROM public.ticket_type tt
    LEFT JOIN public.ticket t ON t.ticket_type_id = tt.id AND t.status = 'active'
    WHERE tt.event_id IN (SELECT id FROM starting_soon)
    GROUP BY tt.event_id
  ),
  no_sales AS (
    SELECT
      ss.id, ss.title,
      'no_sales_yet'::text,
      'Starts ' || to_char(ss.min_starts, 'Mon DD') || ' with no sales yet.'
    FROM starting_soon ss
    LEFT JOIN sold_counts sc ON sc.event_id = ss.id
    WHERE COALESCE(sc.sold, 0) = 0
  ),
  low_registrations AS (
    SELECT
      ss.id, ss.title,
      'low_registrations'::text,
      'Starts ' || to_char(ss.min_starts, 'Mon DD') || ' but only ' || sc.sold || ' sold so far.'
    FROM starting_soon ss
    JOIN sold_counts sc ON sc.event_id = ss.id
    WHERE sc.sold > 0
      AND (
        (sc.capacity IS NOT NULL AND sc.capacity > 0 AND sc.sold::numeric / sc.capacity < 0.2)
        OR (sc.capacity IS NULL AND sc.sold < 5)
      )
  ),
  nearly_sold_out AS (
    SELECT
      tt.event_id,
      oe.title,
      'nearly_sold_out'::text,
      tt.type || ' tickets are almost sold out (' ||
        GREATEST(tt.quantity - COALESCE(tts.sold, 0), 0) || ' left).'
    FROM public.ticket_type tt
    JOIN organizer_events oe ON oe.id = tt.event_id
    LEFT JOIN (
      SELECT ticket_type_id, COUNT(*) AS sold
      FROM public.ticket WHERE status = 'active'
      GROUP BY ticket_type_id
    ) tts ON tts.ticket_type_id = tt.id
    WHERE tt.quantity IS NOT NULL AND tt.quantity > 0
      AND (tt.quantity - COALESCE(tts.sold, 0))::numeric / tt.quantity <= 0.10
      AND (tt.quantity - COALESCE(tts.sold, 0)) > 0
  )
  SELECT * FROM no_sales
  UNION ALL
  SELECT * FROM low_registrations
  UNION ALL
  SELECT * FROM nearly_sold_out
  ORDER BY rule_type;
END;
$function$;

-- ---------------------------------------------------------------------
-- get_organizer_recent_activity: bounded UNION ALL of paid checkouts,
-- cancelled tickets, and free registrations, most recent first. Each
-- branch is independently ORDERed and LIMITed before the outer merge so
-- this stays cheap regardless of total table size (never a full scan
-- looking for "the last N across everything").
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_organizer_recent_activity(p_limit int)
  RETURNS TABLE (
    activity_type   text,
    event_id         uuid,
    event_title      text,
    occurred_at      timestamptz,
    detail           text
  )
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
BEGIN
  RETURN QUERY
  WITH organizer_events AS (
    SELECT e.id, e.title
    FROM public.event e
    WHERE e.organizer_id = auth.uid() AND e.status = 'published'
  ),
  sales AS (
    SELECT
      'ticket_sold'::text AS activity_type,
      tc.event_id,
      oe.title AS event_title,
      COALESCE(tc.completed_at, tc.created_at) AS occurred_at,
      tc.quantity || ' ticket(s) sold' AS detail
    FROM public.ticket_checkout tc
    JOIN organizer_events oe ON oe.id = tc.event_id
    WHERE tc.status = 'paid'
    ORDER BY COALESCE(tc.completed_at, tc.created_at) DESC
    LIMIT p_limit
  ),
  cancellations AS (
    SELECT
      'ticket_cancelled'::text,
      tt.event_id,
      oe.title,
      t.updated_at,
      'Ticket cancelled'::text
    FROM public.ticket t
    JOIN public.ticket_type tt ON tt.id = t.ticket_type_id
    JOIN organizer_events oe ON oe.id = tt.event_id
    WHERE t.status = 'cancelled'
    ORDER BY t.updated_at DESC
    LIMIT p_limit
  ),
  registrations AS (
    SELECT
      'registration'::text,
      tt.event_id,
      oe.title,
      t.created_at,
      'New free registration'::text
    FROM public.ticket t
    JOIN public.ticket_type tt ON tt.id = t.ticket_type_id
    JOIN organizer_events oe ON oe.id = tt.event_id
    WHERE t.status = 'active' AND tt.price = 0
    ORDER BY t.created_at DESC
    LIMIT p_limit
  )
  SELECT * FROM sales
  UNION ALL
  SELECT * FROM cancellations
  UNION ALL
  SELECT * FROM registrations
  ORDER BY occurred_at DESC
  LIMIT p_limit;
END;
$function$;
