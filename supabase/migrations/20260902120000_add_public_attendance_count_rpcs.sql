-- Fixes attendance counts always reading as 0 for anonymous/non-owner
-- viewers (the event details page, its hero/capacity display, EventCard,
-- and search/listing results all showed 0 attendees / full capacity
-- remaining regardless of how many tickets were actually sold).
--
-- Root cause: `attendance` has RLS enabled with only two SELECT policies --
-- the ticket owner can see their own row, and the event organizer can see
-- rows for their own event (see enable_rls_ticketing_batch1.sql /
-- enable_rls_events_batch2.sql). Every place that reads attendance for
-- public display (src/config/supabase/publicClient.ts's cookie-free
-- `publicSupabase`, used specifically so the event page can be statically
-- cached) queries with auth.uid() = NULL, which matches neither policy --
-- so it always got zero rows back, for every event, for every anonymous or
-- non-owner/non-organizer viewer. get_filtered_events (used by search
-- listings) has the same problem: it's a plain (non-SECURITY DEFINER)
-- function, so its own internal `attendance` subquery is equally subject to
-- RLS as the calling role.
--
-- Fix: rather than adding a public SELECT policy on `attendance` (which
-- would let anyone query individual attendance rows directly via the API --
-- i.e. who attended what, not just an aggregate count), add two narrow
-- SECURITY DEFINER functions that return only an aggregate count, never raw
-- rows -- same precedent as the existing get_event_attendee_contacts RPC
-- (a controlled, function-scoped exception to attendance/ticket privacy
-- rather than a blanket policy change).

CREATE OR REPLACE FUNCTION public.get_event_attendance_count(p_event_id uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(a.number_of_tickets), 0)
  FROM attendance a
  WHERE a.event_id = p_event_id AND a.status = 'attending';
$$;

REVOKE ALL ON FUNCTION public.get_event_attendance_count(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_event_attendance_count(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_event_attendance_counts(p_event_ids uuid[])
RETURNS TABLE(event_id uuid, attendance_count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.event_id, COALESCE(SUM(a.number_of_tickets), 0)
  FROM attendance a
  WHERE a.event_id = ANY(p_event_ids) AND a.status = 'attending'
  GROUP BY a.event_id;
$$;

REVOKE ALL ON FUNCTION public.get_event_attendance_counts(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_event_attendance_counts(uuid[]) TO anon, authenticated;

-- get_filtered_events (search listings) computed attendance_count with its
-- own inline `attendance` subquery -- same RLS exposure as above, since this
-- function itself is not SECURITY DEFINER. Redirected to the new helper;
-- every other line is unchanged from the live definition (verified via
-- pg_get_functiondef before editing).
CREATE OR REPLACE FUNCTION public.get_filtered_events(p_min_price numeric, p_max_price numeric, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_user_lat double precision, p_user_lng double precision, p_max_distance_km double precision, p_search_text text, p_event_category text, p_event_type text, p_min_rating numeric, p_cursor_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_distance_km double precision DEFAULT NULL::double precision, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 20)
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
