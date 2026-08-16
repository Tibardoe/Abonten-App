-- Root cause: both functions reference e.event_dates, a column that no
-- longer exists on public.event (verified live: `\d event` has no such
-- column, and UserPostType/the TS layer has no event_dates field either —
-- only `occurrences`/`event_occurrence`, sourced from the event_occurrence
-- child table). get_nearby_events was already correctly migrated to read
-- from event_occurrence; these two were not, so every call to either has
-- been throwing `column e.event_dates does not exist` in production
-- (confirmed by executing both directly against the live database).
--
-- Dropping and recreating (rather than CREATE OR REPLACE) because the
-- return type is changing — event_dates is removed from the output.
DROP FUNCTION IF EXISTS public.get_filtered_events(numeric, numeric, timestamp with time zone, timestamp with time zone, double precision, double precision, double precision, text, text, text, numeric);
DROP FUNCTION IF EXISTS public.get_similar_events(text, extensions.geography, numeric);

-- get_filtered_events used event_dates for exactly one thing — picking the
-- next upcoming occurrence date to sort/display by — which is replaced here
-- with the same lookup against event_occurrence that get_nearby_events
-- already does. The event_dates output column itself is dropped: nothing in
-- the TypeScript layer reads it (UserPostType has no such field).
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
    created_at       timestamp with time zone
  )
  LANGUAGE plpgsql
  AS $function$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.title,
    COALESCE(ed.next_date, e.starts_at) AS starts_at,
    COALESCE(ed.next_date, e.ends_at) AS ends_at,
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
    e.created_at
  FROM
    event e
  LEFT JOIN ticket_type tt ON tt.event_id = e.id
  LEFT JOIN review r ON r.reviewed_id = e.id
  LEFT JOIN LATERAL (
    SELECT eo.starts_at AS next_date
    FROM event_occurrence eo
    WHERE eo.event_id = e.id AND eo.starts_at >= now()
    ORDER BY eo.starts_at ASC
    LIMIT 1
  ) ed ON true
  WHERE
    (p_min_price IS NULL OR p_max_price IS NULL OR tt.price BETWEEN p_min_price AND p_max_price)
    AND (p_start_date IS NULL OR p_end_date IS NULL OR COALESCE(ed.next_date, e.starts_at) BETWEEN p_start_date AND p_end_date)
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
  GROUP BY e.id, ed.next_date
  HAVING
    (p_min_rating IS NULL OR AVG(r.rating) >= p_min_rating OR COUNT(r.rating) = 0)
  ORDER BY
    COALESCE(ed.next_date, e.starts_at) ASC,
    distance_km ASC;
END;
$function$;

GRANT ALL ON FUNCTION public.get_filtered_events(numeric, numeric, timestamp WITH time zone, timestamp
  WITH time zone, double precision, double precision, double precision, text, text, text, numeric) TO anon;
GRANT ALL ON FUNCTION public.get_filtered_events(numeric, numeric, timestamp WITH time zone, timestamp
  WITH time zone, double precision, double precision, double precision, text, text, text, numeric) TO authenticated;
GRANT ALL ON FUNCTION public.get_filtered_events(numeric, numeric, timestamp WITH time zone, timestamp
  WITH time zone, double precision, double precision, double precision, text, text, text, numeric) TO service_role;

-- get_similar_events just passed event_dates straight through with no
-- computation — dropped for the same reason (unused, nonexistent column).
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
    ticket_currency      text
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
    tt.currency
  FROM event e
  LEFT JOIN LATERAL (
    SELECT price, currency
    FROM ticket_type
    WHERE ticket_type.event_id = e.id
    ORDER BY price ASC
    LIMIT 1
  ) tt ON true
  WHERE lower(e.event_category) = lower(input_category)
    AND ST_DWithin(
      e.location::geography,
      input_location,
      input_radius_km * 1000 -- km to meters
    );
END;
$function$;

GRANT ALL ON FUNCTION public.get_similar_events(text, extensions.geography, numeric) TO anon;
GRANT ALL ON FUNCTION public.get_similar_events(text, extensions.geography, numeric) TO authenticated;
GRANT ALL ON FUNCTION public.get_similar_events(text, extensions.geography, numeric) TO service_role;
