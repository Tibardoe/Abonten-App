-- Event Filter modal: the "Type" tiles (Concert, Workshop, etc.) let users
-- select multiple types via TypeFilter.tsx's mode="multi" TileSelector, but
-- get_filtered_events only ever accepted a single p_event_type text value
-- (ILIKE match) -- there was no backend path for more than one selection.
-- Combined with two frontend bugs (Explore's filter branch never sent the
-- selection at all; /search read the wrong query-string key), the Type
-- filter had no effect anywhere. This migration is the backend half of the
-- fix: p_event_type becomes text[], matching an event if ANY selected type
-- ILIKE-matches its event_type. The frontend (getQueriedEvents.ts,
-- FilterModalPopup.tsx, search/page.tsx, EventsTabContent.tsx,
-- FilterSearchBar.tsx) is updated in the same change to normalize the Type
-- selection into an array and actually pass it through on both the /search
-- and /explore/[location] paths.
--
-- CREATE OR REPLACE cannot change an existing parameter's type -- Postgres
-- treats that as a different overload, not a replacement -- so DROP + CREATE
-- is required, same precedent as 20260816100000_add_event_featured_and_fix_
-- status_rpcs.sql and 20260830090000_add_event_explore_columns_to_get_
-- filtered_events.sql. Everything else (signature order/defaults, RETURNS
-- TABLE, body) is left byte-for-byte identical to the live definition in
-- 20260902120000_add_public_attendance_count_rpcs.sql except the p_event_type
-- type and its WHERE clause.

DROP FUNCTION IF EXISTS public.get_filtered_events(
  numeric, numeric, timestamp with time zone, timestamp with time zone,
  double precision, double precision, double precision, text, text, text,
  numeric, timestamp with time zone, double precision, uuid, integer
);

CREATE FUNCTION public.get_filtered_events(
  p_min_price           numeric,
  p_max_price           numeric,
  p_start_date          timestamp with time zone,
  p_end_date            timestamp with time zone,
  p_user_lat            double precision,
  p_user_lng            double precision,
  p_max_distance_km     double precision,
  p_search_text         text,
  p_event_category      text,
  p_event_type          text[],
  p_min_rating          numeric,
  p_cursor_starts_at    timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_cursor_distance_km  double precision DEFAULT NULL::double precision,
  p_cursor_id           uuid DEFAULT NULL::uuid,
  p_page_size           integer DEFAULT 20
)
 RETURNS TABLE(id uuid, title text, starts_at timestamp with time zone, ends_at timestamp with time zone, address jsonb, min_price numeric, currency text, avg_rating numeric, event_code text, distance_km double precision, flyer_public_id text, flyer_version character varying, capacity integer, attendance_count bigint, created_at timestamp with time zone, occurrences json, location geography, event_category text, status character varying, organizer_id uuid)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH matched AS (
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
      public.get_event_attendance_count(e.id) AS attendance_count,
      e.created_at,
      occ_data.occurrences,
      e.location,
      e.event_category,
      e.status,
      e.organizer_id
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
      e.status = 'published'
      AND (
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
      AND (
        p_event_type IS NULL OR array_length(p_event_type, 1) IS NULL
        OR EXISTS (SELECT 1 FROM unnest(p_event_type) t WHERE e.event_type ILIKE '%' || t || '%')
      )
      AND (
        p_min_rating IS NULL
        OR NOT EXISTS (SELECT 1 FROM review r WHERE r.reviewed_id = e.id)
        OR (SELECT AVG(r.rating) FROM review r WHERE r.reviewed_id = e.id) >= p_min_rating
      )
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
  )
  SELECT
    m.id, m.title, m.starts_at, m.ends_at, m.address, m.min_price, m.currency, m.avg_rating,
    m.event_code, m.distance_km, m.flyer_public_id, m.flyer_version, m.capacity,
    m.attendance_count, m.created_at, m.occurrences,
    m.location, m.event_category, m.status, m.organizer_id
  FROM matched m
  WHERE
    p_cursor_id IS NULL
    OR (m.starts_at, COALESCE(m.distance_km, 1e18::double precision), m.id)
       > (p_cursor_starts_at, COALESCE(p_cursor_distance_km, 1e18::double precision), p_cursor_id)
  ORDER BY
    m.starts_at ASC,
    COALESCE(m.distance_km, 1e18::double precision) ASC,
    m.id ASC
  LIMIT p_page_size + 1;
END;
$function$;

GRANT ALL ON FUNCTION public.get_filtered_events(
  numeric, numeric, timestamp with time zone, timestamp with time zone,
  double precision, double precision, double precision, text, text, text[],
  numeric, timestamp with time zone, double precision, uuid, integer
) TO anon;
GRANT ALL ON FUNCTION public.get_filtered_events(
  numeric, numeric, timestamp with time zone, timestamp with time zone,
  double precision, double precision, double precision, text, text, text[],
  numeric, timestamp with time zone, double precision, uuid, integer
) TO authenticated;
GRANT ALL ON FUNCTION public.get_filtered_events(
  numeric, numeric, timestamp with time zone, timestamp with time zone,
  double precision, double precision, double precision, text, text, text[],
  numeric, timestamp with time zone, double precision, uuid, integer
) TO service_role;
