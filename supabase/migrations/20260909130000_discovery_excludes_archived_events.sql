-- Make archived events actually disappear from discovery.
--
-- 20260904165639 (DATA-006) added event.archived_at as the soft-delete for an
-- expired event that can't be hard-deleted because it carries real transaction
-- history: archive_or_delete_expired_event() falls back to
--   update public.event set archived_at = coalesce(archived_at, now())
-- and reports 'archived'. But none of the three discovery RPCs ever looked at
-- the column, so "archived" only appeared to work: the events it was used on
-- were also past-dated, and the date predicates in those functions were what
-- actually hid them.
--
-- Verified on this database: archiving a future-dated published event left it
-- returned by get_nearby_events. Latent today (the only caller is the
-- expired-events cron, which acts on past events), but it means the soft-delete
-- has no effect of its own, and any admin or support use of it would silently
-- fail to hide the event.
--
-- Each function gains `and e.archived_at is null` alongside its existing
-- status / moderation_state guards. This is a no-op for the current data:
-- every archived row is already past-dated and filtered out by date.
--
-- get_filtered_events additionally gets its rating source corrected. It read
--
--   (SELECT AVG(r.rating) FROM review r WHERE r.reviewed_id = e.id)
--
-- but `review.reviewed_id` is a PERSON (an organizer) -- that is what
-- get_user_rating and ratingsQuery.fetchUserRating aggregate. Event reviews
-- live in `event_review`. Comparing a user id against an event id never
-- matched a row, so:
--   * avg_rating was hard-zero on every event this function returned, and
--   * the p_min_rating filter was inert -- its `NOT EXISTS (... review ...)`
--     escape hatch was always true, so the Explore filter sheet's "From 4★"
--     chip (mobile FilterSheet -> useFilteredEvents/useEventSearch
--     p_min_rating) silently returned every event regardless of rating.
-- Confirmed on this database: 0 of the `review` rows join to an event id, 2
-- join to a user id.
--
-- Both now read `event_review` with the same public-visibility predicate
-- get_event_rating uses (status approved, moderation_state not hidden or
-- removed), so a list rating and a detail rating agree.

-- ---------------------------------------------------------------------
-- get_nearby_events
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_nearby_events(
  user_lat double precision,
  user_lng double precision,
  search_radius double precision,
  p_cursor_sort_key timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_cursor_id uuid DEFAULT NULL::uuid,
  p_page_size integer DEFAULT 20
)
RETURNS TABLE(id uuid, organizer_id uuid, event_category text, event_type text, title text, slug text, location geography, address jsonb, website_url text, capacity integer, flyer_public_id text, flyer_version character varying, starts_at timestamp with time zone, ends_at timestamp with time zone, status character varying, created_at timestamp with time zone, event_code text, min_price numeric, currency text, occurrences json, featured boolean, cursor_sort_key timestamp with time zone)
LANGUAGE plpgsql
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
    p.sort_key as cursor_sort_key
  from page p
  join event e on e.id = p.id
  left join lateral (
    select
      min(tt.price) as min_price,
      min(tt.currency) as currency
    from ticket_type tt
    where tt.event_id = e.id
  ) ticket_data on true
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

-- ---------------------------------------------------------------------
-- get_events_in_window
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_events_in_window(
  p_user_lat double precision,
  p_user_lng double precision,
  p_radius_km double precision,
  p_window_start timestamp with time zone,
  p_window_end timestamp with time zone,
  p_cursor_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_cursor_id uuid DEFAULT NULL::uuid,
  p_page_size integer DEFAULT 20
)
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
      AND e.archived_at IS NULL
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
      COALESCE((
        SELECT AVG(r.rating) FROM event_review r
        WHERE r.event_id = e.id
          AND r.status = 'approved'
          AND r.moderation_state IS DISTINCT FROM 'hidden'
          AND r.moderation_state IS DISTINCT FROM 'removed'
      ), 0) AS avg_rating,
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
              json_build_object('id', occ.id, 'starts_at', occ.starts_at, 'ends_at', occ.ends_at)
              ORDER BY occ.starts_at ASC
            )
          ELSE
            json_build_array(json_build_object('id', NULL, 'starts_at', e.starts_at, 'ends_at', e.ends_at))
        END AS occurrences
      FROM event_occurrence occ
      WHERE occ.event_id = e.id
    ) occ_data ON true
    WHERE
      e.status = 'published'
      AND e.archived_at IS NULL
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
        OR COALESCE((
          SELECT AVG(r.rating) FROM event_review r
          WHERE r.event_id = e.id
            AND r.status = 'approved'
            AND r.moderation_state IS DISTINCT FROM 'hidden'
            AND r.moderation_state IS DISTINCT FROM 'removed'
        ), 0) >= p_min_rating
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
