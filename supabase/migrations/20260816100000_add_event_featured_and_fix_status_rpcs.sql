-- Adds a real `featured` flag (previously the banner had no curation
-- concept at all — "featured" was just a deterministic daily hash pick
-- across all nearby events, with no way to exclude ended/ongoing/sold-out
-- events by design) and fixes two RPCs that never accounted for
-- multi-date events at all:
--
--  * get_filtered_events (used by /search): coalesced `ends_at` to the
--    NEXT OCCURRENCE'S START TIME instead of its end time, so a
--    multi-session event's displayed/derived end time was wrong the
--    moment a session started. It also returned no `occurrences` column,
--    so the app-level status calculation (getEventStatus) always fell
--    back to the (wrong) single starts_at/ends_at pair. And it had no
--    "has this event's entire schedule ended" filter at all.
--  * get_similar_events (used by the "Similar Events" slider): same
--    missing-occurrences and missing-ended-filter gaps, with no date
--    filtering whatsoever.
--
-- get_nearby_events (used by the banner) already had the correct
-- "all occurrences" ended-filter; it's only being touched here to also
-- return `featured` so the banner can filter on it.
--
-- Return types are changing on all three functions, so DROP + CREATE
-- (matching the approach in 20260816093000_fix_broken_event_dates_rpcs.sql)
-- rather than CREATE OR REPLACE.

ALTER TABLE public.event
  ADD COLUMN featured boolean DEFAULT false NOT NULL;

DROP FUNCTION IF EXISTS public.get_nearby_events(double precision, double precision, double precision);
DROP FUNCTION IF EXISTS public.get_filtered_events(numeric, numeric, timestamp with time zone, timestamp with time zone, double precision, double precision, double precision, text, text, text, numeric);
DROP FUNCTION IF EXISTS public.get_similar_events(text, extensions.geography, numeric);

CREATE FUNCTION public.get_nearby_events (
  user_lat      double precision,
  user_lng      double precision,
  search_radius double precision
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
    e.featured

  FROM event e

  -- Ticket aggregation
  LEFT JOIN LATERAL (
    SELECT
      MIN(tt.price) AS min_price,
      MIN(tt.currency) AS currency
    FROM ticket_type tt
    WHERE tt.event_id = e.id
  ) ticket_data ON TRUE

  -- Occurrence aggregation (all dates)
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

    -- 🔥 Correct visibility logic
    AND (
      -- Has at least one future occurrence
      EXISTS (
        SELECT 1
        FROM event_occurrence o
        WHERE o.event_id = e.id
          AND o.ends_at > now()
      )

      -- OR has no occurrences and event date is future
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

  ORDER BY
    (
      SELECT MIN(o2.starts_at)
      FROM event_occurrence o2
      WHERE o2.event_id = e.id
        AND o2.ends_at > now()
    ) NULLS LAST,
    e.starts_at ASC;

END;
$function$;

GRANT ALL ON FUNCTION public.get_nearby_events(double precision, double precision, double precision) TO anon;
GRANT ALL ON FUNCTION public.get_nearby_events(double precision, double precision, double precision) TO authenticated;
GRANT ALL ON FUNCTION public.get_nearby_events(double precision, double precision, double precision) TO service_role;

-- get_filtered_events used to derive `ends_at` from the next occurrence's
-- STARTS_AT (a copy/paste bug) and never returned `occurrences`, so the
-- app-level status calculation had nothing but that wrong ends_at to work
-- with. Both are fixed here: the lateral join now returns the matching
-- starts_at/ends_at pair from the SAME next-relevant occurrence row, and a
-- full `occurrences` column is added (same shape as get_nearby_events) so
-- callers can run the real multi-occurrence status logic instead of
-- guessing from a single collapsed date.
CREATE FUNCTION public.get_filtered_events (
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
    MIN(tt.price) AS min_price,
    MIN(tt.currency) AS currency,
    COALESCE(AVG(r.rating), 0) AS avg_rating,
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
  LEFT JOIN ticket_type tt ON tt.event_id = e.id
  LEFT JOIN review r ON r.reviewed_id = e.id
  -- Same occurrence, not just the same start time: picks the earliest
  -- occurrence that hasn't ended yet (so a currently-ongoing session is
  -- still "the" relevant one), and returns both its start AND end.
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
    (p_min_price IS NULL OR p_max_price IS NULL OR tt.price BETWEEN p_min_price AND p_max_price)
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
  GROUP BY e.id, ed.next_starts_at, ed.next_ends_at, occ_data.occurrences
  HAVING
    (p_min_rating IS NULL OR AVG(r.rating) >= p_min_rating OR COUNT(r.rating) = 0)
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

-- get_similar_events previously had no date/status filtering whatsoever
-- (any event in the category+radius was returned, ended or not) and
-- returned no occurrences. Both gaps are fixed the same way as above.
CREATE FUNCTION public.get_similar_events (
  input_category  text,
  input_location  extensions.geography,
  input_radius_km numeric
)
  RETURNS TABLE (
    id                   uuid,
    organizer_id         uuid,
    event_category       text,
    event_type           text,
    title                text,
    slug                 text,
    description          text,
    location             extensions.geography,
    address              jsonb,
    website_url          text,
    capacity             integer,
    flyer_public_id      text,
    flyer_version        character varying,
    starts_at            timestamp with time zone,
    ends_at              timestamp with time zone,
    status               character varying,
    created_at           timestamp with time zone,
    event_code           text,
    require_registration boolean,
    ticket_price         numeric,
    ticket_currency      text,
    occurrences          json
  )
  LANGUAGE plpgsql
  STABLE
  AS $function$
BEGIN
  RETURN QUERY
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
    e.require_registration,
    tt.price,
    tt.currency,
    occ_data.occurrences
  FROM event e
  LEFT JOIN LATERAL (
    SELECT price, currency
    FROM ticket_type
    WHERE ticket_type.event_id = e.id
    ORDER BY price ASC
    LIMIT 1
  ) tt ON true
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
  WHERE lower(e.event_category) = lower(input_category)
    AND ST_DWithin(
      e.location::geography,
      input_location,
      input_radius_km * 1000 -- km to meters
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
    );
END;
$function$;

GRANT ALL ON FUNCTION public.get_similar_events(text, extensions.geography, numeric) TO anon;
GRANT ALL ON FUNCTION public.get_similar_events(text, extensions.geography, numeric) TO authenticated;
GRANT ALL ON FUNCTION public.get_similar_events(text, extensions.geography, numeric) TO service_role;
