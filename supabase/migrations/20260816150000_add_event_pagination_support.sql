-- Adds cursor-based pagination to the events-domain RPCs so infinite-scroll
-- lists can page through results server-side instead of the app fetching a
-- capped 200-row batch and (for the "happening today/week/month" filters)
-- filtering by date in JavaScript afterward.
--
-- get_nearby_events and get_filtered_events both order by a COMPUTED column
-- (nearest relevant occurrence date, ST_Distance), not a stored one, so a
-- plain column index can't support the ORDER BY directly. Each function is
-- rewritten to wrap its existing SELECT in a CTE that materializes the sort
-- key(s) as real output columns, then applies a keyset predicate + LIMIT in
-- an outer query. Only new trailing parameters (all DEFAULT-ed) are added,
-- and RETURNS TABLE is unchanged, so CREATE OR REPLACE is safe here (per
-- Postgres docs: replacing a function is allowed when appending new
-- parameters with defaults, since existing callers are unaffected).
--
-- get_similar_events is untouched — it's a 20-item capped widget, not an
-- infinite-scroll target.

-- Support the WHERE/JOIN clauses every one of these RPCs already runs.
-- (Computed ORDER BY columns can't be indexed directly, so these target
-- filtering, not sorting.)
CREATE INDEX IF NOT EXISTS idx_event_status
  ON public.event (status);

CREATE INDEX IF NOT EXISTS idx_event_occurrence_event_starts
  ON public.event_occurrence (event_id, starts_at);

-- ---------------------------------------------------------------------
-- get_nearby_events: add cursor pagination (sort key + id tiebreak).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_nearby_events (
  user_lat            double precision,
  user_lng            double precision,
  search_radius       double precision,
  p_cursor_sort_key   timestamp with time zone DEFAULT NULL,
  p_cursor_id         uuid DEFAULT NULL,
  p_page_size         integer DEFAULT 20
)
  RETURNS TABLE (
    id              uuid,
    organizer_id    uuid,
    event_category  text,
    event_type      text,
    title           text,
    slug            text,
    description     text,
    location        extensions.geography,
    address         jsonb,
    website_url     text,
    capacity        integer,
    flyer_public_id text,
    flyer_version   character varying,
    starts_at       timestamp with time zone,
    ends_at         timestamp with time zone,
    status          character varying,
    created_at      timestamp with time zone,
    event_code      text,
    min_price       numeric,
    currency        text,
    occurrences     json,
    featured        boolean
  )
  LANGUAGE plpgsql
  AS $function$
BEGIN
  RETURN QUERY
  WITH matched AS (
    SELECT
      e.id,
      e.organizer_id,
      e.event_category,
      e.event_type,
      e.title,
      e.slug,
      e.description,
      e.location,
      e.address,
      e.website_url,
      e.capacity,
      e.flyer_public_id,
      e.flyer_version,
      e.starts_at,
      e.ends_at,
      e.status,
      e.created_at,
      e.event_code,
      ticket_data.min_price,
      ticket_data.currency,
      occ_data.occurrences,
      e.featured,
      -- Same ordering rule as before, just materialized as a real column so
      -- it can be used in a keyset WHERE predicate. NULLS coalesced to a
      -- sentinel far in the future to preserve "NULLS LAST" through a plain
      -- two-column keyset compare.
      COALESCE(
        (
          SELECT MIN(o2.starts_at)
          FROM event_occurrence o2
          WHERE o2.event_id = e.id AND o2.ends_at > now()
        ),
        'infinity'::timestamptz
      ) AS sort_key
    FROM event e
    LEFT JOIN LATERAL (
      SELECT
        MIN(tt.price) AS min_price,
        MIN(tt.currency) AS currency
      FROM ticket_type tt
      WHERE tt.event_id = e.id
    ) ticket_data ON TRUE
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
    ) occ_data ON TRUE
    WHERE
      e.status = 'published'
      AND ST_DWithin(
        e.location,
        ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326),
        search_radius
      )
      AND (
        EXISTS (
          SELECT 1
          FROM event_occurrence o
          WHERE o.event_id = e.id
            AND o.ends_at > now()
        )
        OR (
          NOT EXISTS (
            SELECT 1
            FROM event_occurrence o
            WHERE o.event_id = e.id
          )
          AND (
            e.ends_at > now()
            OR (e.ends_at IS NULL AND e.starts_at > now())
          )
        )
      )
  )
  SELECT
    m.id, m.organizer_id, m.event_category, m.event_type, m.title, m.slug, m.description,
    m.location, m.address, m.website_url, m.capacity, m.flyer_public_id, m.flyer_version,
    m.starts_at, m.ends_at, m.status, m.created_at, m.event_code, m.min_price, m.currency,
    m.occurrences, m.featured
  FROM matched m
  WHERE
    p_cursor_id IS NULL
    OR (m.sort_key, m.id) > (p_cursor_sort_key, p_cursor_id)
  ORDER BY m.sort_key ASC, m.id ASC
  LIMIT p_page_size + 1;
END;
$function$;

-- ---------------------------------------------------------------------
-- get_filtered_events: add cursor pagination (starts_at, distance, id).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_filtered_events (
  p_min_price           numeric,
  p_max_price           numeric,
  p_start_date          timestamp with time zone,
  p_end_date            timestamp with time zone,
  p_user_lat            double precision,
  p_user_lng            double precision,
  p_max_distance_km     double precision,
  p_search_text         text,
  p_event_category      text,
  p_event_type          text,
  p_min_rating          numeric,
  p_cursor_starts_at    timestamp with time zone DEFAULT NULL,
  p_cursor_distance_km  double precision DEFAULT NULL,
  p_cursor_id           uuid DEFAULT NULL,
  p_page_size           integer DEFAULT 20
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
    m.attendance_count, m.created_at, m.occurrences
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

-- ---------------------------------------------------------------------
-- get_events_in_window: new RPC backing "Happening Today/This Week/This
-- Month". Replaces the app-layer JS date filter (getFilteredEvents.ts's
-- filterEventsByWindow, applied after an already-capped nearby-events
-- fetch) with a real server-side, paginated date-range query.
--
-- Preserves the existing "any occurrence in window, event listed once"
-- semantics from getOccurrenceStarts().some(...) — i.e. picks the EARLIEST
-- occurrence (or the event's own starts_at, if it has no occurrence rows)
-- that falls inside [p_window_start, p_window_end] — rather than
-- get_filtered_events's "nearest future occurrence overall" rule, which
-- would silently change which window a multi-date event is considered to
-- fall into.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_events_in_window (
  p_user_lat          double precision,
  p_user_lng          double precision,
  p_radius_km         double precision,
  p_window_start      timestamp with time zone,
  p_window_end        timestamp with time zone,
  p_cursor_starts_at  timestamp with time zone DEFAULT NULL,
  p_cursor_id         uuid DEFAULT NULL,
  p_page_size         integer DEFAULT 20
)
  RETURNS TABLE (
    id              uuid,
    organizer_id    uuid,
    event_category  text,
    event_type      text,
    title           text,
    slug            text,
    description     text,
    location        extensions.geography,
    address         jsonb,
    website_url     text,
    capacity        integer,
    flyer_public_id text,
    flyer_version   character varying,
    starts_at       timestamp with time zone,
    ends_at         timestamp with time zone,
    status          character varying,
    created_at      timestamp with time zone,
    event_code      text,
    min_price       numeric,
    currency        text,
    occurrences     json,
    featured        boolean
  )
  LANGUAGE plpgsql
  AS $function$
BEGIN
  RETURN QUERY
  WITH matched AS (
    SELECT
      e.id,
      e.organizer_id,
      e.event_category,
      e.event_type,
      e.title,
      e.slug,
      e.description,
      e.location,
      e.address,
      e.website_url,
      e.capacity,
      e.flyer_public_id,
      e.flyer_version,
      e.status,
      e.created_at,
      e.event_code,
      ticket_data.min_price,
      ticket_data.currency,
      occ_data.occurrences,
      e.featured,
      win.window_starts_at,
      win.window_ends_at
    FROM event e
    -- Inner LATERAL join: an event with no occurrence (or fallback
    -- starts_at) inside the window is excluded entirely.
    JOIN LATERAL (
      SELECT candidate.starts_at AS window_starts_at, candidate.ends_at AS window_ends_at
      FROM (
        SELECT o.starts_at, o.ends_at
        FROM event_occurrence o
        WHERE o.event_id = e.id
        UNION ALL
        SELECT e.starts_at, e.ends_at
        WHERE NOT EXISTS (SELECT 1 FROM event_occurrence o2 WHERE o2.event_id = e.id)
      ) candidate
      WHERE candidate.starts_at BETWEEN p_window_start AND p_window_end
      ORDER BY candidate.starts_at ASC
      LIMIT 1
    ) win ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        MIN(tt.price) AS min_price,
        MIN(tt.currency) AS currency
      FROM ticket_type tt
      WHERE tt.event_id = e.id
    ) ticket_data ON TRUE
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
    ) occ_data ON TRUE
    WHERE
      e.status = 'published'
      AND (
        p_user_lat IS NULL OR p_user_lng IS NULL
        OR ST_DWithin(e.location, ST_MakePoint(p_user_lng, p_user_lat)::geography, p_radius_km * 1000)
      )
  )
  SELECT
    m.id, m.organizer_id, m.event_category, m.event_type, m.title, m.slug, m.description,
    m.location, m.address, m.website_url, m.capacity, m.flyer_public_id, m.flyer_version,
    m.window_starts_at AS starts_at, m.window_ends_at AS ends_at, m.status, m.created_at,
    m.event_code, m.min_price, m.currency, m.occurrences, m.featured
  FROM matched m
  WHERE
    p_cursor_id IS NULL
    OR (m.window_starts_at, m.id) > (p_cursor_starts_at, p_cursor_id)
  ORDER BY m.window_starts_at ASC, m.id ASC
  LIMIT p_page_size + 1;
END;
$function$;

GRANT ALL ON FUNCTION public.get_events_in_window(
  double precision, double precision, double precision,
  timestamp with time zone, timestamp with time zone,
  timestamp with time zone, uuid, integer
) TO anon;
GRANT ALL ON FUNCTION public.get_events_in_window(
  double precision, double precision, double precision,
  timestamp with time zone, timestamp with time zone,
  timestamp with time zone, uuid, integer
) TO authenticated;
GRANT ALL ON FUNCTION public.get_events_in_window(
  double precision, double precision, double precision,
  timestamp with time zone, timestamp with time zone,
  timestamp with time zone, uuid, integer
) TO service_role;
