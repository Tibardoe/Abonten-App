-- Fixes "invalid UNION/INTERSECT/EXCEPT ORDER BY clause" in
-- get_organizer_needs_attention: `ORDER BY rule_type` after a UNION ALL of
-- unaliased SELECT * branches requires the branches to actually name their
-- output columns (Postgres only allows ordering a set operation by a
-- result column NAME, not a positional expression) — caught during
-- post-deploy smoke-testing, never relied on by application code.

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
      ss.id AS event_id, ss.title AS event_title,
      'no_sales_yet'::text AS rule_type,
      'Starts ' || to_char(ss.min_starts, 'Mon DD') || ' with no sales yet.' AS message
    FROM starting_soon ss
    LEFT JOIN sold_counts sc ON sc.event_id = ss.id
    WHERE COALESCE(sc.sold, 0) = 0
  ),
  low_registrations AS (
    SELECT
      ss.id AS event_id, ss.title AS event_title,
      'low_registrations'::text AS rule_type,
      'Starts ' || to_char(ss.min_starts, 'Mon DD') || ' but only ' || sc.sold || ' sold so far.' AS message
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
      tt.event_id AS event_id,
      oe.title AS event_title,
      'nearly_sold_out'::text AS rule_type,
      tt.type || ' tickets are almost sold out (' ||
        GREATEST(tt.quantity - COALESCE(tts.sold, 0), 0) || ' left).' AS message
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
