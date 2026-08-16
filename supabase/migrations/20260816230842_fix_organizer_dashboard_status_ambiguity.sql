-- Fixes a bare `status` column reference inside get_organizer_upcoming_events
-- and get_organizer_needs_attention that's ambiguous against the `status`
-- OUT parameter created by RETURNS TABLE (PL/pgSQL resolves unqualified
-- identifiers against OUT params first) — caught during post-deploy
-- smoke-testing, never relied on by application code.

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
    SELECT t2.ticket_type_id, COUNT(*) AS sold
    FROM public.ticket t2
    WHERE t2.status = 'active'
    GROUP BY t2.ticket_type_id
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
      SELECT t2.ticket_type_id, COUNT(*) AS sold
      FROM public.ticket t2
      WHERE t2.status = 'active'
      GROUP BY t2.ticket_type_id
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
