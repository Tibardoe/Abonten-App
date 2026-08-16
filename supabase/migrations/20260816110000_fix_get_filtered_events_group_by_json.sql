-- get_filtered_events (from 20260816100000_add_event_featured_and_fix_status_rpcs.sql)
-- added an `occurrences json` column and grouped by it (GROUP BY e.id,
-- ed.next_starts_at, ed.next_ends_at, occ_data.occurrences) to make the
-- other aggregates (MIN(tt.price), AVG(r.rating), etc.) work per-event.
-- Postgres has no equality operator for the `json` type, so anything using
-- it in GROUP BY fails at call time with "could not identify an equality
-- operator for type json" — confirmed by actually calling the function
-- against the live database after applying that migration, not caught by
-- static review.
--
-- Fixed by dropping GROUP BY/HAVING entirely and switching min_price/
-- currency/avg_rating (and the price/rating filters that depended on the
-- grouped rows) to correlated subqueries/EXISTS checks, matching the style
-- attendance_count already used in this same function. This preserves the
-- original filtering semantics (an event qualifies on price if ANY of its
-- ticket types falls in range; on rating if it has none yet or its average
-- meets the bar) without needing to group by anything at all — so the json
-- occurrences column no longer needs an equality operator.
--
-- Return type is unchanged from the previous version, so CREATE OR REPLACE
-- is safe here (unlike the DROP+CREATE needed when the columns changed).
CREATE OR REPLACE FUNCTION public.get_filtered_events (
  p_min_price       numeric,
  p_max_price       numeric,
  p_start_date      timestamp with time zone,
  p_end_date        timestamp with time zone,
  p_user_lat        double precision,
  p_user_lng        double precision,
  p_max_distance_km double precision,
  p_search_text     text,
  p_event_category  text,
  p_event_type      text,
  p_min_rating      numeric
)
  RETURNS TABLE (
    id               uuid,
    title            text,
    starts_at        timestamp with time zone,
    ends_at          timestamp with time zone,
    address          jsonb,
    min_price        numeric,
    currency         text,
    avg_rating       numeric,
    event_code       text,
    distance_km      double precision,
    flyer_public_id  text,
    flyer_version    character varying,
    capacity         integer,
    attendance_count bigint,
    created_at       timestamp with time zone,
    occurrences      json
  )
  LANGUAGE plpgsql
  AS $function$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.title,
    COALESCE(ed.next_starts_at, e.starts_at) AS starts_at,
    COALESCE(ed.next_ends_at, e.ends_at) AS ends_at,
    e.address,
    (SELECT MIN(tt.price) FROM ticket_type tt WHERE tt.event_id = e.id) AS min_price,
    (SELECT MIN(tt.currency) FROM ticket_type tt WHERE tt.event_id = e.id) AS currency,
    COALESCE((SELECT AVG(r.rating) FROM review r WHERE r.reviewed_id = e.id), 0) AS avg_rating,
    e.event_code,
    ST_Distance(e.location, ST_MakePoint(p_user_lng, p_user_lat)::geography)/1000 AS distance_km,
    e.flyer_public_id,
    e.flyer_version,
    e.capacity,
    (
      SELECT COALESCE(SUM(a.number_of_tickets), 0) FROM attendance a
      WHERE a.event_id = e.id AND a.status = 'attending'
    ) AS attendance_count,
    e.created_at,
    occ_data.occurrences
  FROM
    event e
  LEFT JOIN LATERAL (
    SELECT eo.starts_at AS next_starts_at, eo.ends_at AS next_ends_at
    FROM event_occurrence eo
    WHERE eo.event_id = e.id AND eo.ends_at > now()
    ORDER BY eo.starts_at ASC
    LIMIT 1
  ) ed ON true
  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN COUNT(*) > 0 THEN
          json_agg(
            json_build_object(
              'id', occ.id,
              'starts_at', occ.starts_at,
              'ends_at', occ.ends_at
            )
            ORDER BY occ.starts_at ASC
          )
        ELSE
          json_build_array(
            json_build_object(
              'id', NULL,
              'starts_at', e.starts_at,
              'ends_at', e.ends_at
            )
          )
      END AS occurrences
    FROM event_occurrence occ
    WHERE occ.event_id = e.id
  ) occ_data ON true
  WHERE
    (
      p_min_price IS NULL OR p_max_price IS NULL
      OR EXISTS (
        SELECT 1 FROM ticket_type tt
        WHERE tt.event_id = e.id AND tt.price BETWEEN p_min_price AND p_max_price
      )
    )
    AND (p_start_date IS NULL OR p_end_date IS NULL OR COALESCE(ed.next_starts_at, e.starts_at) BETWEEN p_start_date AND p_end_date)
    AND (
      p_user_lat IS NULL OR p_user_lng IS NULL
      OR ST_DWithin(e.location, ST_MakePoint(p_user_lng, p_user_lat)::geography, p_max_distance_km * 1000)
    )
    AND (
      p_search_text IS NULL OR
      e.title ILIKE '%' || p_search_text || '%' OR
      e.description ILIKE '%' || p_search_text || '%' OR
      e.event_category ILIKE '%' || p_search_text || '%' OR
      e.event_type ILIKE '%' || p_search_text || '%' OR
      e.slug ILIKE '%' || p_search_text || '%' OR
      (e.address->>'name') ILIKE '%' || p_search_text || '%'
    )
    AND (p_event_category IS NULL OR e.event_category ILIKE '%' || p_event_category || '%')
    AND (p_event_type IS NULL OR e.event_type ILIKE '%' || p_event_type || '%')
    AND (
      p_min_rating IS NULL
      OR NOT EXISTS (SELECT 1 FROM review r WHERE r.reviewed_id = e.id)
      OR (SELECT AVG(r.rating) FROM review r WHERE r.reviewed_id = e.id) >= p_min_rating
    )
    -- Exclude events whose entire schedule has ended — same rule as
    -- get_nearby_events: eligible if any occurrence hasn't ended yet, or
    -- (no occurrence rows at all) the main starts_at/ends_at hasn't ended.
    AND (
      EXISTS (
        SELECT 1 FROM event_occurrence o
        WHERE o.event_id = e.id AND o.ends_at > now()
      )
      OR (
        NOT EXISTS (SELECT 1 FROM event_occurrence o WHERE o.event_id = e.id)
        AND (e.ends_at > now() OR (e.ends_at IS NULL AND e.starts_at > now()))
      )
    )
  ORDER BY
    COALESCE(ed.next_starts_at, e.starts_at) ASC,
    distance_km ASC;
END;
$function$;

GRANT ALL ON FUNCTION public.get_filtered_events(numeric, numeric, timestamp WITH time zone, timestamp
  WITH time zone, double precision, double precision, double precision, text, text, text, numeric) TO anon;
GRANT ALL ON FUNCTION public.get_filtered_events(numeric, numeric, timestamp WITH time zone, timestamp
  WITH time zone, double precision, double precision, double precision, text, text, text, numeric) TO authenticated;
GRANT ALL ON FUNCTION public.get_filtered_events(numeric, numeric, timestamp WITH time zone, timestamp
  WITH time zone, double precision, double precision, double precision, text, text, text, numeric) TO service_role;
