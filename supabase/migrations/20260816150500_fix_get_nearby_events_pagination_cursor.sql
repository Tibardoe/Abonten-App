-- get_nearby_events's cursor pagination (added in
-- 20260816150000_add_event_pagination_support.sql) didn't expose the
-- computed `sort_key` it orders by as an output column — the returned
-- `starts_at` is the raw event.starts_at column, which is NULL for
-- multi-date events (see postEvent.ts), not the same value used for
-- ORDER BY/keyset comparison. Confirmed by querying the function directly
-- against the live DB: several rows had starts_at = NULL while their real
-- sort_key (nearest future occurrence, or 'infinity' sentinel) was not
-- NULL. A caller building the next-page cursor from the last row of a page
-- had no correct value to use.
--
-- Fix: expose the sort key as a new `cursor_sort_key` output column.
-- Return type is changing (new column), so DROP + CREATE (matching the
-- approach already used by 20260816093000/100000 for the same reason).
DROP FUNCTION IF EXISTS public.get_nearby_events(double precision, double precision, double precision, timestamp with time zone, uuid, integer);

CREATE FUNCTION public.get_nearby_events (
  user_lat            double precision,
  user_lng            double precision,
  search_radius       double precision,
  p_cursor_sort_key   timestamp with time zone DEFAULT NULL,
  p_cursor_id         uuid DEFAULT NULL,
  p_page_size         integer DEFAULT 20
)
  RETURNS TABLE (
    id               uuid,
    organizer_id     uuid,
    event_category   text,
    event_type       text,
    title            text,
    slug             text,
    description      text,
    location         extensions.geography,
    address          jsonb,
    website_url      text,
    capacity         integer,
    flyer_public_id  text,
    flyer_version    character varying,
    starts_at        timestamp with time zone,
    ends_at          timestamp with time zone,
    status           character varying,
    created_at       timestamp with time zone,
    event_code       text,
    min_price        numeric,
    currency         text,
    occurrences      json,
    featured         boolean,
    cursor_sort_key  timestamp with time zone
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
    m.occurrences, m.featured, m.sort_key AS cursor_sort_key
  FROM matched m
  WHERE
    p_cursor_id IS NULL
    OR (m.sort_key, m.id) > (p_cursor_sort_key, p_cursor_id)
  ORDER BY m.sort_key ASC, m.id ASC
  LIMIT p_page_size + 1;
END;
$function$;

GRANT ALL ON FUNCTION public.get_nearby_events(double precision, double precision, double precision, timestamp with time zone, uuid, integer) TO anon;
GRANT ALL ON FUNCTION public.get_nearby_events(double precision, double precision, double precision, timestamp with time zone, uuid, integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_nearby_events(double precision, double precision, double precision, timestamp with time zone, uuid, integer) TO service_role;
