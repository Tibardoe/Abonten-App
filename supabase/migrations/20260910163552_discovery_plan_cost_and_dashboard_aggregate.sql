-- Discovery RPCs: cut per-call planning cost. Organizer dashboard: one call.
--
-- WHY (measured on this database, 2026-09-10)
--
-- Every discovery RPC executes in a millisecond or two once its plan is
-- cached, but the plan is expensive to build and, under Supavisor's
-- transaction-mode pooling, is rebuilt far more often than it is reused:
--
--   get_filtered_events   49.5 ms cold -> 5.6 ms warm   (as authenticated)
--                         36.4 ms cold -> 0.9 ms warm   (RLS not applied)
--   get_nearby_places     46.0 ms cold -> 1.0 ms warm
--   get_events_in_window  62.8 ms cold -> 3.1 ms warm
--
-- pg_stat_statements agrees: get_filtered_events shows min 0.1 ms, mean
-- 165 ms, max 2.5 s over 510 production calls -- a plan-cache-miss profile,
-- on a table of 19 events.
--
-- The plan is expensive because these functions run as the caller, so the
-- planner inlines the row-level security policy of every table they touch.
-- The public-read policies on event_occurrence, ticket_type, event_review,
-- attendance, place_review and place_opening_hours are all of the form
-- "EXISTS (select 1 from event/place parent where parent is published)",
-- and each one is re-embedded at every reference: the get_filtered_events
-- plan carried ~85 sub-plans, most of them that same lookup repeated.
--
-- Every function below already restricts its own top-level rows to
-- published, non-archived, non-hidden events/places, which is exactly the
-- condition those child policies re-check. Running them as SECURITY DEFINER
-- therefore exposes no row that RLS would have hidden -- it only stops the
-- planner re-deriving a fact the WHERE clause has already established.
-- search_path stays pinned; none of them read auth.uid().
--
-- get_filtered_events also scanned event_occurrence four separate times
-- and ticket_type / event_review twice each per candidate row. Those are
-- collapsed to one lateral per table. Semantics are unchanged and the
-- discovery-filters integration suite covers the archived / rating /
-- window behaviour.
--
-- get_nearby_events additionally returns attendance_count and ticket_types
-- (appended columns). The mobile Explore screen was making a second,
-- serial round trip (get_event_attendance_counts + a ticket_type read) for
-- exactly this data after every nearby fetch; the web action did the same
-- for attendance. Returning it inline removes a whole network stage from
-- the first screen every user sees. Return type change => drop + recreate.
--
-- get_similar_events was missed by 20260909130000 and still returned
-- archived events. Fixed here.
--
-- Finally, the organizer Dashboard read seven RPCs over two HTTP calls
-- (overview x2, timeline, performance, upcoming, attention, activity).
-- get_organizer_dashboard runs all seven inside one database round trip and
-- returns one jsonb document. The seven originals are untouched -- the web
-- Dashboard keeps calling them individually for its interactive sort.

-- ---------------------------------------------------------------------
-- get_filtered_events
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_filtered_events(
  p_min_price numeric,
  p_max_price numeric,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone,
  p_user_lat double precision,
  p_user_lng double precision,
  p_max_distance_km double precision,
  p_search_text text,
  p_event_category text,
  p_event_type text[],
  p_min_rating numeric,
  p_cursor_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_cursor_distance_km double precision DEFAULT NULL::double precision,
  p_cursor_id uuid DEFAULT NULL::uuid,
  p_page_size integer DEFAULT 20
)
RETURNS TABLE(id uuid, title text, starts_at timestamp with time zone, ends_at timestamp with time zone, address jsonb, min_price numeric, currency text, avg_rating numeric, event_code text, distance_km double precision, flyer_public_id text, flyer_version character varying, capacity integer, attendance_count bigint, created_at timestamp with time zone, occurrences json, location geography, event_category text, status character varying, organizer_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH matched AS (
    SELECT
      e.id,
      e.title,
      COALESCE(occ.next_starts_at, e.starts_at) AS starts_at,
      COALESCE(occ.next_ends_at, e.ends_at) AS ends_at,
      e.address,
      tk.min_price,
      tk.currency,
      COALESCE(rv.avg_rating, 0) AS avg_rating,
      e.event_code,
      ST_Distance(e.location, ST_MakePoint(p_user_lng, p_user_lat)::geography) / 1000 AS distance_km,
      e.flyer_public_id,
      e.flyer_version,
      e.capacity,
      COALESCE(att.attendance_count, 0)::bigint AS attendance_count,
      e.created_at,
      occ.occurrences,
      e.location,
      e.event_category,
      e.status,
      e.organizer_id
    FROM event e
    -- One pass over the occurrences: next future slot, whether any future
    -- slot exists, and the JSON list the cards render.
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) AS total,
        bool_or(o.ends_at > now()) AS has_future,
        MIN(o.starts_at) FILTER (WHERE o.ends_at > now()) AS next_starts_at,
        (array_agg(o.ends_at ORDER BY o.starts_at) FILTER (WHERE o.ends_at > now()))[1] AS next_ends_at,
        CASE
          WHEN COUNT(*) > 0 THEN
            json_agg(
              json_build_object('id', o.id, 'starts_at', o.starts_at, 'ends_at', o.ends_at)
              ORDER BY o.starts_at ASC
            )
          ELSE
            json_build_array(json_build_object('id', NULL, 'starts_at', e.starts_at, 'ends_at', e.ends_at))
        END AS occurrences
      FROM event_occurrence o
      WHERE o.event_id = e.id
    ) occ ON true
    LEFT JOIN LATERAL (
      SELECT
        MIN(tt.price) AS min_price,
        MIN(tt.currency) AS currency,
        bool_or(tt.price BETWEEN p_min_price AND p_max_price) AS in_price_range
      FROM ticket_type tt
      WHERE tt.event_id = e.id
    ) tk ON true
    LEFT JOIN LATERAL (
      SELECT AVG(r.rating) AS avg_rating
      FROM event_review r
      WHERE r.event_id = e.id
        AND r.status = 'approved'
        AND r.moderation_state IS DISTINCT FROM 'hidden'
        AND r.moderation_state IS DISTINCT FROM 'removed'
    ) rv ON true
    LEFT JOIN LATERAL (
      SELECT SUM(a.number_of_tickets) AS attendance_count
      FROM attendance a
      WHERE a.event_id = e.id AND a.status = 'attending'
    ) att ON true
    WHERE
      e.status = 'published'
      AND e.archived_at IS NULL
      AND e.moderation_state IS DISTINCT FROM 'hidden'
      AND e.moderation_state IS DISTINCT FROM 'removed'
      AND (p_min_price IS NULL OR p_max_price IS NULL OR tk.in_price_range)
      AND (
        p_start_date IS NULL OR p_end_date IS NULL
        OR COALESCE(occ.next_starts_at, e.starts_at) BETWEEN p_start_date AND p_end_date
      )
      AND (
        p_user_lat IS NULL OR p_user_lng IS NULL
        OR ST_DWithin(e.location, ST_MakePoint(p_user_lng, p_user_lat)::geography, p_max_distance_km * 1000)
      )
      AND (
        p_search_text IS NULL OR p_search_text = '' OR
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
      AND (p_min_rating IS NULL OR COALESCE(rv.avg_rating, 0) >= p_min_rating)
      AND (
        COALESCE(occ.has_future, false)
        OR (
          COALESCE(occ.total, 0) = 0
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

-- ---------------------------------------------------------------------
-- get_nearby_events  (return type gains attendance_count, ticket_types)
-- ---------------------------------------------------------------------
DROP FUNCTION public.get_nearby_events(double precision, double precision, double precision, timestamp with time zone, uuid, integer);

CREATE FUNCTION public.get_nearby_events(
  user_lat double precision,
  user_lng double precision,
  search_radius double precision,
  p_cursor_sort_key timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_cursor_id uuid DEFAULT NULL::uuid,
  p_page_size integer DEFAULT 20
)
RETURNS TABLE(id uuid, organizer_id uuid, event_category text, event_type text, title text, slug text, location geography, address jsonb, website_url text, capacity integer, flyer_public_id text, flyer_version character varying, starts_at timestamp with time zone, ends_at timestamp with time zone, status character varying, created_at timestamp with time zone, event_code text, min_price numeric, currency text, occurrences json, featured boolean, cursor_sort_key timestamp with time zone, attendance_count bigint, ticket_types json)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
begin
  return query
  with candidate as (
    select
      e.id,
      coalesce(fo.next_start, 'infinity'::timestamptz) as sort_key
    from event e
    left join lateral (
      select
        min(o.starts_at) filter (where o.ends_at > now()) as next_start,
        count(*) as total
      from event_occurrence o
      where o.event_id = e.id
    ) fo on true
    where
      e.status = 'published'
      and e.archived_at is null
      and e.moderation_state is distinct from 'hidden'
      and e.moderation_state is distinct from 'removed'
      and st_dwithin(
        e.location,
        st_setsrid(st_makepoint(user_lng, user_lat), 4326),
        search_radius
      )
      and (
        fo.next_start is not null
        or (
          coalesce(fo.total, 0) = 0
          and (
            e.ends_at > now()
            or (e.ends_at is null and e.starts_at > now())
          )
        )
      )
  ),
  page as (
    select c.id, c.sort_key
    from candidate c
    where
      p_cursor_id is null
      or (c.sort_key, c.id) > (p_cursor_sort_key, p_cursor_id)
    order by c.sort_key asc, c.id asc
    limit p_page_size + 1
  )
  select
    e.id,
    e.organizer_id,
    e.event_category,
    e.event_type,
    e.title,
    e.slug,
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
    p.sort_key as cursor_sort_key,
    coalesce(att.attendance_count, 0)::bigint as attendance_count,
    ticket_data.ticket_types
  from page p
  join event e on e.id = p.id
  -- Tier rows in one pass: the aggregate the cards used to get, plus the
  -- per-tier stock they used to fetch separately. `quantity` is remaining
  -- stock (null = unlimited), the same column ticket_type_select exposes.
  left join lateral (
    select
      min(tt.price) as min_price,
      min(tt.currency) as currency,
      json_agg(
        json_build_object('price', tt.price, 'currency', tt.currency, 'quantity', tt.quantity)
        order by tt.price asc
      ) as ticket_types
    from ticket_type tt
    where tt.event_id = e.id
  ) ticket_data on true
  left join lateral (
    select sum(a.number_of_tickets) as attendance_count
    from attendance a
    where a.event_id = e.id and a.status = 'attending'
  ) att on true
  left join lateral (
    select
      case
        when count(*) > 0 then
          json_agg(
            json_build_object(
              'id', occ.id,
              'starts_at', occ.starts_at,
              'ends_at', occ.ends_at
            )
            order by occ.starts_at asc
          )
        else
          json_build_array(
            json_build_object(
              'id', null,
              'starts_at', e.starts_at,
              'ends_at', e.ends_at
            )
          )
      end as occurrences
    from event_occurrence occ
    where occ.event_id = e.id
  ) occ_data on true
  order by p.sort_key asc, p.id asc;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_nearby_events(double precision, double precision, double precision, timestamp with time zone, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_nearby_events(double precision, double precision, double precision, timestamp with time zone, uuid, integer) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- get_nearby_places / get_filtered_places / get_active_place_promotions
-- get_events_in_window / get_similar_events  -> SECURITY DEFINER
-- ---------------------------------------------------------------------
ALTER FUNCTION public.get_nearby_places(double precision, double precision, double precision, double precision, uuid, integer) SECURITY DEFINER;
ALTER FUNCTION public.get_filtered_places(text, smallint, numeric, boolean, double precision, double precision, double precision, double precision, uuid, integer) SECURITY DEFINER;
ALTER FUNCTION public.get_active_place_promotions(double precision, double precision, double precision, integer) SECURITY DEFINER;
ALTER FUNCTION public.get_events_in_window(double precision, double precision, double precision, timestamp with time zone, timestamp with time zone, timestamp with time zone, uuid, integer) SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_similar_events(input_category text, input_location geography, input_radius_km numeric)
RETURNS TABLE(id uuid, organizer_id uuid, event_category text, event_type text, title text, slug text, description text, location geography, address jsonb, website_url text, capacity integer, flyer_public_id text, flyer_version character varying, starts_at timestamp with time zone, ends_at timestamp with time zone, status character varying, created_at timestamp with time zone, event_code text, require_registration boolean, ticket_price numeric, ticket_currency text, occurrences json)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.organizer_id, e.event_category, e.event_type, e.title, e.slug, e.description,
    e.location, e.address, e.website_url, e.capacity, e.flyer_public_id, e.flyer_version,
    e.starts_at, e.ends_at, e.status, e.created_at, e.event_code, e.require_registration,
    tt.price, tt.currency, occ.occurrences
  FROM event e
  LEFT JOIN LATERAL (
    SELECT price, currency FROM ticket_type
    WHERE ticket_type.event_id = e.id ORDER BY price ASC LIMIT 1
  ) tt ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total,
      bool_or(o.ends_at > now()) AS has_future,
      CASE
        WHEN COUNT(*) > 0 THEN
          json_agg(json_build_object('id', o.id, 'starts_at', o.starts_at, 'ends_at', o.ends_at) ORDER BY o.starts_at ASC)
        ELSE
          json_build_array(json_build_object('id', NULL, 'starts_at', e.starts_at, 'ends_at', e.ends_at))
      END AS occurrences
    FROM event_occurrence o WHERE o.event_id = e.id
  ) occ ON true
  WHERE e.status = 'published'
    AND e.archived_at IS NULL
    AND e.moderation_state IS DISTINCT FROM 'hidden'
    AND e.moderation_state IS DISTINCT FROM 'removed'
    AND lower(e.event_category) = lower(input_category)
    AND ST_DWithin(e.location::geography, input_location, input_radius_km * 1000)
    AND (
      COALESCE(occ.has_future, false)
      OR (
        COALESCE(occ.total, 0) = 0
        AND (e.ends_at > now() OR (e.ends_at IS NULL AND e.starts_at > now()))
      )
    );
END;
$function$;

-- ---------------------------------------------------------------------
-- get_organizer_dashboard: the whole Dashboard screen in one round trip
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_organizer_dashboard(
  p_start timestamp with time zone,
  p_end timestamp with time zone,
  p_prev_start timestamp with time zone,
  p_prev_end timestamp with time zone,
  p_bucket text
)
RETURNS jsonb
LANGUAGE sql
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'overview_current',
      (SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
       FROM public.get_organizer_dashboard_overview(p_start, p_end) o),
    'overview_previous',
      CASE WHEN p_prev_start IS NULL OR p_prev_end IS NULL THEN NULL
      ELSE (SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
            FROM public.get_organizer_dashboard_overview(p_prev_start, p_prev_end) o)
      END,
    'timeline',
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.bucket_start), '[]'::jsonb)
       FROM public.get_organizer_sales_timeline(p_start, p_end, p_bucket) t),
    'performance',
      (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
       FROM public.get_organizer_event_performance(p_start, p_end, 'revenue', 10) r),
    'upcoming',
      (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
       FROM public.get_organizer_upcoming_events(5) r),
    'attention',
      (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
       FROM public.get_organizer_needs_attention(7) r),
    'activity',
      (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
       FROM public.get_organizer_recent_activity(8) r)
  );
$function$;

-- Runs as the caller: every wrapped function scopes to auth.uid() itself.
REVOKE ALL ON FUNCTION public.get_organizer_dashboard(timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_organizer_dashboard(timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, text) TO authenticated, service_role;
