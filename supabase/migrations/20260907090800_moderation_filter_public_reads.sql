-- Admin Console Phase 1 — exclude staff-moderated content from the public
-- discovery RPCs.
--
-- 20260907090300_moderation_state.sql added event/place.moderation_state.
-- These SECURITY DEFINER PostGIS functions are the public read paths for
-- events and places (getQueriedEvents / getNearByEvents / getSimilarEvents
-- / events-in-window / places list + nearby). Each body is reproduced
-- verbatim from the live definition with ONE added predicate next to the
-- existing `status = 'published'` filter:
--
--     AND <alias>.moderation_state IS DISTINCT FROM 'hidden'
--     AND <alias>.moderation_state IS DISTINCT FROM 'removed'
--
-- ('visible' / 'restricted' / NULL all stay visible; 'restricted' is
-- "flagged but public".) Application-level @abonten/services read modules
-- and the /api/mobile plain-table reads get the same filter in code —
-- see the accompanying app changes.
--
-- This is a deliberate schema change (CLAUDE.md §2), reviewed and approved
-- as part of the Admin Console plan. Applied live via Supabase MCP
-- (project sderrexhawjbmsugndcq); verify with get_advisors after.

-- ============================================================
-- get_filtered_events
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_filtered_events(p_min_price numeric, p_max_price numeric, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_user_lat double precision, p_user_lng double precision, p_max_distance_km double precision, p_search_text text, p_event_category text, p_event_type text[], p_min_rating numeric, p_cursor_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_distance_km double precision DEFAULT NULL::double precision, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 20)
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
      AND e.moderation_state IS DISTINCT FROM 'hidden'
      AND e.moderation_state IS DISTINCT FROM 'removed'
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

-- ============================================================
-- get_nearby_events (paginated overload)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_nearby_events(user_lat double precision, user_lng double precision, search_radius double precision, p_cursor_sort_key timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 20)
 RETURNS TABLE(id uuid, organizer_id uuid, event_category text, event_type text, title text, slug text, description text, location geography, address jsonb, website_url text, capacity integer, flyer_public_id text, flyer_version character varying, starts_at timestamp with time zone, ends_at timestamp with time zone, status character varying, created_at timestamp with time zone, event_code text, min_price numeric, currency text, occurrences json, featured boolean, cursor_sort_key timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
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
      AND e.moderation_state IS DISTINCT FROM 'hidden'
      AND e.moderation_state IS DISTINCT FROM 'removed'
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

-- ============================================================
-- get_nearby_events (legacy non-paginated overload)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_nearby_events(user_lat double precision, user_lng double precision, search_radius double precision)
 RETURNS TABLE(id uuid, organizer_id uuid, event_category text, event_type text, title text, slug text, description text, location geography, address jsonb, website_url text, capacity integer, flyer_public_id text, flyer_version character varying, starts_at timestamp with time zone, ends_at timestamp with time zone, status character varying, created_at timestamp with time zone, event_code text, min_price numeric, currency text, occurrences json, featured boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.organizer_id, e.event_category, e.event_type, e.title, e.slug, e.description,
    e.location, e.address, e.website_url, e.capacity, e.flyer_public_id, e.flyer_version,
    e.starts_at, e.ends_at, e.status, e.created_at, e.event_code,
    ticket_data.min_price, ticket_data.currency,
    occ_data.occurrences, e.featured
  FROM event e
  LEFT JOIN LATERAL (
    SELECT MIN(tt.price) AS min_price, MIN(tt.currency) AS currency
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
  WHERE
    e.status = 'published'
    AND e.moderation_state IS DISTINCT FROM 'hidden'
    AND e.moderation_state IS DISTINCT FROM 'removed'
    AND ST_DWithin(e.location, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326), search_radius)
    AND (
      EXISTS (SELECT 1 FROM event_occurrence o WHERE o.event_id = e.id AND o.ends_at > now())
      OR (
        NOT EXISTS (SELECT 1 FROM event_occurrence o WHERE o.event_id = e.id)
        AND (e.ends_at > now() OR (e.ends_at IS NULL AND e.starts_at > now()))
      )
    )
  ORDER BY
    (SELECT MIN(o2.starts_at) FROM event_occurrence o2 WHERE o2.event_id = e.id AND o2.ends_at > now()) NULLS LAST,
    e.starts_at ASC;
END;
$function$;

-- ============================================================
-- get_events_in_window
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_events_in_window(p_user_lat double precision, p_user_lng double precision, p_radius_km double precision, p_window_start timestamp with time zone, p_window_end timestamp with time zone, p_cursor_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 20)
 RETURNS TABLE(id uuid, organizer_id uuid, event_category text, event_type text, title text, slug text, description text, location geography, address jsonb, website_url text, capacity integer, flyer_public_id text, flyer_version character varying, starts_at timestamp with time zone, ends_at timestamp with time zone, status character varying, created_at timestamp with time zone, event_code text, min_price numeric, currency text, occurrences json, featured boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH matched AS (
    SELECT
      e.id, e.organizer_id, e.event_category, e.event_type, e.title, e.slug, e.description,
      e.location, e.address, e.website_url, e.capacity, e.flyer_public_id, e.flyer_version,
      e.status, e.created_at, e.event_code,
      ticket_data.min_price, ticket_data.currency,
      occ_data.occurrences, e.featured,
      win.window_starts_at, win.window_ends_at
    FROM event e
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
      SELECT MIN(tt.price) AS min_price, MIN(tt.currency) AS currency
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
    WHERE
      e.status = 'published'
      AND e.moderation_state IS DISTINCT FROM 'hidden'
      AND e.moderation_state IS DISTINCT FROM 'removed'
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

-- ============================================================
-- get_similar_events
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_similar_events(input_category text, input_location geography, input_radius_km numeric)
 RETURNS TABLE(id uuid, organizer_id uuid, event_category text, event_type text, title text, slug text, description text, location geography, address jsonb, website_url text, capacity integer, flyer_public_id text, flyer_version character varying, starts_at timestamp with time zone, ends_at timestamp with time zone, status character varying, created_at timestamp with time zone, event_code text, require_registration boolean, ticket_price numeric, ticket_currency text, occurrences json)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.organizer_id, e.event_category, e.event_type, e.title, e.slug, e.description,
    e.location, e.address, e.website_url, e.capacity, e.flyer_public_id, e.flyer_version,
    e.starts_at, e.ends_at, e.status, e.created_at, e.event_code, e.require_registration,
    tt.price, tt.currency, occ_data.occurrences
  FROM event e
  LEFT JOIN LATERAL (
    SELECT price, currency FROM ticket_type
    WHERE ticket_type.event_id = e.id ORDER BY price ASC LIMIT 1
  ) tt ON true
  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN COUNT(*) > 0 THEN
          json_agg(json_build_object('id', occ.id, 'starts_at', occ.starts_at, 'ends_at', occ.ends_at) ORDER BY occ.starts_at ASC)
        ELSE
          json_build_array(json_build_object('id', NULL, 'starts_at', e.starts_at, 'ends_at', e.ends_at))
      END AS occurrences
    FROM event_occurrence occ WHERE occ.event_id = e.id
  ) occ_data ON true
  WHERE e.status = 'published'
    AND e.moderation_state IS DISTINCT FROM 'hidden'
    AND e.moderation_state IS DISTINCT FROM 'removed'
    AND lower(e.event_category) = lower(input_category)
    AND ST_DWithin(e.location::geography, input_location, input_radius_km * 1000)
    AND (
      EXISTS (SELECT 1 FROM event_occurrence o WHERE o.event_id = e.id AND o.ends_at > now())
      OR (
        NOT EXISTS (SELECT 1 FROM event_occurrence o WHERE o.event_id = e.id)
        AND (e.ends_at > now() OR (e.ends_at IS NULL AND e.starts_at > now()))
      )
    );
END;
$function$;

-- ============================================================
-- get_filtered_places
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_filtered_places(p_search_text text DEFAULT NULL::text, p_category_id smallint DEFAULT NULL::smallint, p_min_rating numeric DEFAULT NULL::numeric, p_open_now boolean DEFAULT NULL::boolean, p_user_lat double precision DEFAULT NULL::double precision, p_user_lng double precision DEFAULT NULL::double precision, p_max_distance_km double precision DEFAULT NULL::double precision, p_cursor_distance double precision DEFAULT NULL::double precision, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 20)
 RETURNS TABLE(id uuid, owner_id uuid, name text, slug text, description text, category_id smallint, category_name text, category_slug text, location geography, address jsonb, website_url text, phone text, whatsapp text, cover_public_id text, cover_version character varying, status text, temporary_status text, claimed boolean, verified boolean, created_at timestamp with time zone, avg_rating numeric, review_count bigint, is_open boolean, distance_km double precision, cursor_distance_km double precision)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH matched AS (
    SELECT
      p.id, p.owner_id, p.name, p.slug, p.description, p.category_id,
      pc.name AS category_name, pc.slug AS category_slug,
      p.location, p.address, p.website_url, p.phone, p.whatsapp,
      p.cover_public_id, p.cover_version, p.status, p.temporary_status,
      p.claimed, p.verified, p.created_at,
      review_data.avg_rating, review_data.review_count,
      public.place_is_open_now(p.id) AS is_open,
      CASE
        WHEN p_user_lat IS NOT NULL AND p_user_lng IS NOT NULL THEN
          ST_Distance(p.location, ST_SetSRID(ST_MakePoint(p_user_lng, p_user_lat), 4326)) / 1000.0
        ELSE NULL
      END AS distance_km
    FROM place p
    JOIN place_category pc ON pc.id = p.category_id
    LEFT JOIN LATERAL (
      SELECT AVG(r.rating)::numeric AS avg_rating, COUNT(*) AS review_count
      FROM place_review r
      WHERE r.place_id = p.id AND r.status = 'approved'
    ) review_data ON TRUE
    WHERE
      p.status = 'published'
      AND p.moderation_state IS DISTINCT FROM 'hidden'
      AND p.moderation_state IS DISTINCT FROM 'removed'
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (p_search_text IS NULL OR p_search_text = '' OR p.name ILIKE '%' || p_search_text || '%' OR p.description ILIKE '%' || p_search_text || '%')
      AND (p_min_rating IS NULL OR COALESCE(review_data.avg_rating, 0) >= p_min_rating)
      AND (p_open_now IS NOT TRUE OR public.place_is_open_now(p.id))
      AND (
        p_max_distance_km IS NULL OR p_user_lat IS NULL OR p_user_lng IS NULL
        OR ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(p_user_lng, p_user_lat), 4326), p_max_distance_km * 1000)
      )
  )
  SELECT
    m.id, m.owner_id, m.name, m.slug, m.description, m.category_id,
    m.category_name, m.category_slug, m.location, m.address, m.website_url,
    m.phone, m.whatsapp, m.cover_public_id, m.cover_version, m.status,
    m.temporary_status, m.claimed, m.verified, m.created_at,
    m.avg_rating, m.review_count, m.is_open, m.distance_km,
    COALESCE(m.distance_km, 0) AS cursor_distance_km
  FROM matched m
  WHERE
    p_cursor_id IS NULL
    OR (COALESCE(m.distance_km, 0), m.id) > (p_cursor_distance, p_cursor_id)
  ORDER BY COALESCE(m.distance_km, 0) ASC, m.id ASC
  LIMIT p_page_size + 1;
END;
$function$;

-- ============================================================
-- get_nearby_places
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_nearby_places(user_lat double precision, user_lng double precision, search_radius double precision, p_cursor_distance double precision DEFAULT NULL::double precision, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 20)
 RETURNS TABLE(id uuid, owner_id uuid, name text, slug text, description text, category_id smallint, category_name text, category_slug text, location geography, address jsonb, website_url text, phone text, whatsapp text, cover_public_id text, cover_version character varying, status text, temporary_status text, claimed boolean, verified boolean, created_at timestamp with time zone, avg_rating numeric, review_count bigint, is_open boolean, distance_km double precision, cursor_distance_km double precision)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH matched AS (
    SELECT
      p.id, p.owner_id, p.name, p.slug, p.description, p.category_id,
      pc.name AS category_name, pc.slug AS category_slug,
      p.location, p.address, p.website_url, p.phone, p.whatsapp,
      p.cover_public_id, p.cover_version, p.status, p.temporary_status,
      p.claimed, p.verified, p.created_at,
      review_data.avg_rating, review_data.review_count,
      public.place_is_open_now(p.id) AS is_open,
      ST_Distance(p.location, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)) / 1000.0 AS distance_km
    FROM place p
    JOIN place_category pc ON pc.id = p.category_id
    LEFT JOIN LATERAL (
      SELECT AVG(r.rating)::numeric AS avg_rating, COUNT(*) AS review_count
      FROM place_review r
      WHERE r.place_id = p.id AND r.status = 'approved'
    ) review_data ON TRUE
    WHERE
      p.status = 'published'
      AND p.moderation_state IS DISTINCT FROM 'hidden'
      AND p.moderation_state IS DISTINCT FROM 'removed'
      AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326), search_radius)
  )
  SELECT
    m.id, m.owner_id, m.name, m.slug, m.description, m.category_id,
    m.category_name, m.category_slug, m.location, m.address, m.website_url,
    m.phone, m.whatsapp, m.cover_public_id, m.cover_version, m.status,
    m.temporary_status, m.claimed, m.verified, m.created_at,
    m.avg_rating, m.review_count, m.is_open, m.distance_km,
    m.distance_km AS cursor_distance_km
  FROM matched m
  WHERE
    p_cursor_id IS NULL
    OR (m.distance_km, m.id) > (p_cursor_distance, p_cursor_id)
  ORDER BY m.distance_km ASC, m.id ASC
  LIMIT p_page_size + 1;
END;
$function$;
