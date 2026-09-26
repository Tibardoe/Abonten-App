-- Audit 2026-09-26: the date-window feed built every row before picking a page.
--
-- get_events_in_window ("Happening today / this week / this month") computed,
-- for EVERY published event in the radius, its lowest ticket price and its
-- full list of dates as JSON, then sorted and kept 21 rows. Reports 08 and 09
-- measured 363 ms at 100,000 events near one point; the harness
-- (scripts/perf/discovery-window-perf.sql) measured 378 ms at 50 km and
-- ~100 ms at 10 km.
--
-- Two changes, same signature, columns, order and grants (CREATE OR
-- REPLACE keeps them); the body replaced is the production definition
-- (fingerprint checked on 2026-09-26):
--
--   * Time first: each event's earliest start inside the window comes
--     straight from two new start-time indexes, instead of a per-event
--     LATERAL run for every event in the radius. Same rule, same rows.
--   * Page first: the price and the list of dates are built for the 21
--     rows returned, not for every match.

create index if not exists idx_event_starts_at_discoverable
  on public.event (starts_at)
  where status = 'published' and archived_at is null;

create index if not exists idx_event_occurrence_starts_at
  on public.event_occurrence (starts_at);

CREATE OR REPLACE FUNCTION public.get_events_in_window(p_user_lat double precision, p_user_lng double precision, p_radius_km double precision, p_window_start timestamp with time zone, p_window_end timestamp with time zone, p_cursor_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 20)
 RETURNS TABLE(id uuid, organizer_id uuid, event_category text, event_type text, title text, slug text, description text, location geography, address jsonb, website_url text, capacity integer, flyer_public_id text, flyer_version character varying, starts_at timestamp with time zone, ends_at timestamp with time zone, status character varying, created_at timestamp with time zone, event_code text, min_price numeric, currency text, occurrences json, featured boolean, timezone text, country_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH windowed AS (
    -- Each event's earliest start inside the window, straight from the two
    -- start-time indexes: its own date when it has no occurrence rows, else
    -- its earliest occurrence in the window (the rule the old per-event
    -- LATERAL applied to every event in the radius).
    SELECT e2.id, e2.starts_at AS window_starts_at, e2.ends_at AS window_ends_at
    FROM event e2
    WHERE e2.status = 'published' AND e2.archived_at IS NULL
      AND e2.starts_at BETWEEN p_window_start AND p_window_end
      AND NOT EXISTS (SELECT 1 FROM event_occurrence o2 WHERE o2.event_id = e2.id)
    UNION ALL
    (
      SELECT DISTINCT ON (o.event_id) o.event_id, o.starts_at, o.ends_at
      FROM event_occurrence o
      WHERE o.starts_at BETWEEN p_window_start AND p_window_end
      ORDER BY o.event_id, o.starts_at ASC
    )
  ),
  page AS (
    SELECT w.id, w.window_starts_at, w.window_ends_at
    FROM windowed w
    JOIN event e ON e.id = w.id
    WHERE
      e.status = 'published'
      AND e.archived_at IS NULL
      AND e.moderation_state IS DISTINCT FROM 'hidden'
      AND e.moderation_state IS DISTINCT FROM 'removed'
      AND (e.country_code <> all ((select public.hidden_listing_countries())::text[]))
      AND (
        p_user_lat IS NULL OR p_user_lng IS NULL
        OR ST_DWithin(e.location, ST_MakePoint(p_user_lng, p_user_lat)::geography, p_radius_km * 1000)
      )
      AND (
        p_cursor_id IS NULL
        OR (w.window_starts_at, w.id) > (p_cursor_starts_at, p_cursor_id)
      )
    ORDER BY w.window_starts_at ASC, w.id ASC
    LIMIT p_page_size + 1
  )
  SELECT
    e.id, e.organizer_id, e.event_category, e.event_type, e.title, e.slug, e.description,
    e.location, e.address, e.website_url, e.capacity, e.flyer_public_id, e.flyer_version,
    p.window_starts_at AS starts_at, p.window_ends_at AS ends_at, e.status, e.created_at,
    e.event_code, ticket_data.min_price, e.currency::text AS currency, occ_data.occurrences,
    e.featured, e.timezone::text AS timezone, e.country_code::text AS country_code
  FROM page p
  JOIN event e ON e.id = p.id
  LEFT JOIN LATERAL (
    SELECT MIN(tt.price) AS min_price
    FROM ticket_type tt WHERE tt.event_id = e.id
  ) ticket_data ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN COUNT(*) > 0 THEN
          json_agg(json_build_object('id', occ.id, 'starts_at', occ.starts_at, 'ends_at', occ.ends_at) ORDER BY occ.starts_at ASC)
        ELSE
          json_build_array(json_build_object('id', NULL, 'starts_at', e.starts_at, 'ends_at', e.ends_at))
      END AS occurrences
    FROM event_occurrence occ WHERE occ.event_id = e.id
  ) occ_data ON TRUE
  ORDER BY p.window_starts_at ASC, p.id ASC;
END;
$function$;
