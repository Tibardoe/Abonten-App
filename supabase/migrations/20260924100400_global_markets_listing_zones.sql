-- Global markets, part 5: listings carry their own zone and country.
--
-- Event times are shown in the EVENT's time zone (a Lagos event reads at
-- Lagos time wherever the viewer is), but the discovery RPCs only returned
-- the instant, so cards fell back to the viewer's zone. They now also
-- return the event's `timezone` and `country_code`, and read the price
-- currency from the event (every tier carries the event's currency since
-- 20260924100100, so `e.currency` is the authoritative one).
--
-- Adding output columns changes each function's row type, so each is
-- dropped and recreated with the same body, arguments and grants.

drop function if exists public.get_events_in_window(p_user_lat double precision, p_user_lng double precision, p_radius_km double precision, p_window_start timestamp with time zone, p_window_end timestamp with time zone, p_cursor_starts_at timestamp with time zone, p_cursor_id uuid, p_page_size integer);

CREATE OR REPLACE FUNCTION public.get_events_in_window(p_user_lat double precision, p_user_lng double precision, p_radius_km double precision, p_window_start timestamp with time zone, p_window_end timestamp with time zone, p_cursor_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 20)
 RETURNS TABLE(id uuid, organizer_id uuid, event_category text, event_type text, title text, slug text, description text, location geography, address jsonb, website_url text, capacity integer, flyer_public_id text, flyer_version character varying, starts_at timestamp with time zone, ends_at timestamp with time zone, status character varying, created_at timestamp with time zone, event_code text, min_price numeric, currency text, occurrences json, featured boolean, timezone text, country_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH matched AS (
    SELECT
      e.id, e.organizer_id, e.event_category, e.event_type, e.title, e.slug, e.description,
      e.location, e.address, e.website_url, e.capacity, e.flyer_public_id, e.flyer_version,
      e.status, e.created_at, e.event_code,
      ticket_data.min_price, e.currency::text AS currency,
      occ_data.occurrences, e.featured, e.timezone::text AS timezone, e.country_code::text AS country_code,
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
    m.event_code, m.min_price, m.currency, m.occurrences, m.featured, m.timezone, m.country_code
  FROM matched m
  WHERE
    p_cursor_id IS NULL
    OR (m.window_starts_at, m.id) > (p_cursor_starts_at, p_cursor_id)
  ORDER BY m.window_starts_at ASC, m.id ASC
  LIMIT p_page_size + 1;
END;
$function$;

revoke all on function public.get_events_in_window(p_user_lat double precision, p_user_lng double precision, p_radius_km double precision, p_window_start timestamp with time zone, p_window_end timestamp with time zone, p_cursor_starts_at timestamp with time zone, p_cursor_id uuid, p_page_size integer) from public, anon, authenticated;
grant execute on function public.get_events_in_window(p_user_lat double precision, p_user_lng double precision, p_radius_km double precision, p_window_start timestamp with time zone, p_window_end timestamp with time zone, p_cursor_starts_at timestamp with time zone, p_cursor_id uuid, p_page_size integer) to anon, authenticated, service_role;

drop function if exists public.get_filtered_events(p_min_price numeric, p_max_price numeric, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_user_lat double precision, p_user_lng double precision, p_max_distance_km double precision, p_search_text text, p_event_category text, p_event_type text[], p_min_rating numeric, p_cursor_starts_at timestamp with time zone, p_cursor_distance_km double precision, p_cursor_id uuid, p_page_size integer);

CREATE OR REPLACE FUNCTION public.get_filtered_events(p_min_price numeric, p_max_price numeric, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_user_lat double precision, p_user_lng double precision, p_max_distance_km double precision, p_search_text text, p_event_category text, p_event_type text[], p_min_rating numeric, p_cursor_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_distance_km double precision DEFAULT NULL::double precision, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 20)
 RETURNS TABLE(id uuid, title text, starts_at timestamp with time zone, ends_at timestamp with time zone, address jsonb, min_price numeric, currency text, avg_rating numeric, event_code text, distance_km double precision, flyer_public_id text, flyer_version character varying, capacity integer, attendance_count bigint, created_at timestamp with time zone, occurrences json, location geography, event_category text, status character varying, organizer_id uuid, timezone text, country_code text)
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
      e.currency::text AS currency,
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
      e.organizer_id,
      e.timezone::text AS timezone,
      e.country_code::text AS country_code
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
    m.location, m.event_category, m.status, m.organizer_id, m.timezone, m.country_code
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

revoke all on function public.get_filtered_events(p_min_price numeric, p_max_price numeric, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_user_lat double precision, p_user_lng double precision, p_max_distance_km double precision, p_search_text text, p_event_category text, p_event_type text[], p_min_rating numeric, p_cursor_starts_at timestamp with time zone, p_cursor_distance_km double precision, p_cursor_id uuid, p_page_size integer) from public, anon, authenticated;
grant execute on function public.get_filtered_events(p_min_price numeric, p_max_price numeric, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_user_lat double precision, p_user_lng double precision, p_max_distance_km double precision, p_search_text text, p_event_category text, p_event_type text[], p_min_rating numeric, p_cursor_starts_at timestamp with time zone, p_cursor_distance_km double precision, p_cursor_id uuid, p_page_size integer) to anon, authenticated, service_role;

drop function if exists public.get_similar_events(input_category text, input_location geography, input_radius_km numeric);

CREATE OR REPLACE FUNCTION public.get_similar_events(input_category text, input_location geography, input_radius_km numeric)
 RETURNS TABLE(id uuid, organizer_id uuid, event_category text, event_type text, title text, slug text, description text, location geography, address jsonb, website_url text, capacity integer, flyer_public_id text, flyer_version character varying, starts_at timestamp with time zone, ends_at timestamp with time zone, status character varying, created_at timestamp with time zone, event_code text, require_registration boolean, ticket_price numeric, ticket_currency text, occurrences json, timezone text, country_code text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.organizer_id, e.event_category, e.event_type, e.title, e.slug, e.description,
    e.location, e.address, e.website_url, e.capacity, e.flyer_public_id, e.flyer_version,
    e.starts_at, e.ends_at, e.status, e.created_at, e.event_code, e.require_registration,
    tt.price, e.currency::text, occ.occurrences, e.timezone::text, e.country_code::text
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

revoke all on function public.get_similar_events(input_category text, input_location geography, input_radius_km numeric) from public, anon, authenticated;
grant execute on function public.get_similar_events(input_category text, input_location geography, input_radius_km numeric) to anon, authenticated, service_role;

drop function if exists public.search_events(p_query text, p_lat double precision, p_lng double precision, p_radius_km double precision, p_category text, p_types text[], p_min_price numeric, p_max_price numeric, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_min_rating numeric, p_organizer_id uuid, p_as_of timestamp with time zone, p_cursor_score numeric, p_cursor_id uuid, p_page_size integer);

CREATE OR REPLACE FUNCTION public.search_events(p_query text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_km double precision DEFAULT NULL::double precision, p_category text DEFAULT NULL::text, p_types text[] DEFAULT NULL::text[], p_min_price numeric DEFAULT NULL::numeric, p_max_price numeric DEFAULT NULL::numeric, p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_min_rating numeric DEFAULT NULL::numeric, p_organizer_id uuid DEFAULT NULL::uuid, p_as_of timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_score numeric DEFAULT NULL::numeric, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 20)
 RETURNS TABLE(id uuid, title text, starts_at timestamp with time zone, ends_at timestamp with time zone, address jsonb, min_price numeric, currency text, avg_rating numeric, event_code text, distance_km double precision, flyer_public_id text, flyer_version character varying, capacity integer, attendance_count bigint, created_at timestamp with time zone, occurrences json, location geography, event_category text, status character varying, organizer_id uuid, organizer_username text, organizer_verified boolean, is_new boolean, score numeric, as_of timestamp with time zone, timezone text, country_code text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_norm   text := public._search_normalize(p_query);
  v_as_of  timestamptz := least(greatest(coalesce(p_as_of, now()), now() - interval '10 minutes'),
                                now() + interval '10 minutes');
  v_origin extensions.geography;
  v_size   integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
  v_types  text[] := case when p_types is null or cardinality(p_types) = 0 then null else p_types end;
  v_narrow boolean := p_min_price is not null or p_max_price is not null or p_start_date is not null
                      or p_end_date is not null or p_min_rating is not null or v_types is not null;
begin
  if left(v_norm, 1) = '@' then
    return;
  end if;
  if length(v_norm) = 1 then
    v_norm := '';
  end if;
  if p_lat is not null and p_lng is not null then
    v_origin := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  end if;

  return query
  with pool as (
    select * from public._search_event_pool(
      v_norm, p_organizer_id, p_category, v_origin, p_radius_km, v_as_of,
      case when v_narrow then 2000 else 400 end)
  ),
  scored as (
    select
      e.id, e.title,
      coalesce(occ.next_starts_at, e.starts_at) as starts_at,
      coalesce(occ.next_ends_at, e.ends_at) as ends_at,
      e.address, tk.min_price, e.currency::text as currency,
      coalesce(rv.avg_rating, 0)::numeric as avg_rating,
      e.event_code,
      case when v_origin is null then null
           else extensions.st_distance(e.location, v_origin) / 1000 end as distance_km,
      e.flyer_public_id, e.flyer_version, e.capacity,
      coalesce(att.attendance_count, 0)::bigint as attendance_count,
      e.created_at, occ.occurrences, e.location, e.event_category, e.status, e.organizer_id,
      e.timezone::text as event_timezone, e.country_code::text as event_country_code,
      u.username::text as organizer_username,
      coalesce(u.organizer_verified and u.status_id = 1, false) as organizer_verified,
      (e.created_at > v_as_of - interval '14 days') as is_new,
      round((
        0.45 * pool.text_score
        + 0.15 * (case
                    when coalesce(occ.next_starts_at, e.starts_at) is null then 0.0
                    when coalesce(occ.next_starts_at, e.starts_at) <= v_as_of then 1.0
                    else exp(greatest(-50.0, -0.693147 * extract(epoch from (coalesce(occ.next_starts_at, e.starts_at) - v_as_of)) / 3600.0 / 168.0))
                  end)
        + 0.15 * (case when v_origin is null then 0.5
                       else exp(greatest(-50.0, -0.693147 * (extensions.st_distance(e.location, v_origin) / 1000) / 10.0)) end)
        + 0.10 * (0.6 * least(1.0, ln(1 + coalesce(att.attendance_count, 0) + 2 * coalesce(fv.favorite_count, 0)) / ln(501))
                  + 0.4 * (((coalesce(rv.rating_sum, 0) + 5 * 3.8) / (coalesce(rv.review_count, 0) + 5)) - 1) / 4)
        + 0.05 * (0.5 * (e.flyer_public_id is not null)::int + 0.5 * (length(coalesce(e.description, '')) >= 80)::int)
        + 0.03 * coalesce(u.organizer_verified and u.status_id = 1, false)::int
        + 0.08 * greatest(0.0, 1 - extract(epoch from (v_as_of - e.created_at)) / 86400.0 / 14.0)
      )::numeric, 6) as score
    from pool
    join public.event e on e.id = pool.id
    left join public.user_info u on u.id = e.organizer_id
    left join lateral (
      select
        min(o.starts_at) filter (where o.ends_at > v_as_of) as next_starts_at,
        (array_agg(o.ends_at order by o.starts_at) filter (where o.ends_at > v_as_of))[1] as next_ends_at,
        case when count(*) > 0 then
          json_agg(json_build_object('id', o.id, 'starts_at', o.starts_at, 'ends_at', o.ends_at)
                   order by o.starts_at asc)
        else
          json_build_array(json_build_object('id', null, 'starts_at', e.starts_at, 'ends_at', e.ends_at))
        end as occurrences
      from public.event_occurrence o
      where o.event_id = e.id
    ) occ on true
    left join lateral (
      select min(tt.price) as min_price, min(tt.currency) as currency,
             bool_or(tt.price between coalesce(p_min_price, 0) and coalesce(p_max_price, 1e12)) as in_price_range
      from public.ticket_type tt
      where tt.event_id = e.id
    ) tk on true
    left join lateral (
      select avg(r.rating) as avg_rating, sum(r.rating) as rating_sum, count(*) as review_count
      from public.event_review r
      where r.event_id = e.id
        and r.status = 'approved'
        and r.moderation_state is distinct from 'hidden'
        and r.moderation_state is distinct from 'removed'
    ) rv on true
    left join lateral (
      select sum(a.number_of_tickets) as attendance_count
      from public.attendance a
      where a.event_id = e.id and a.status = 'attending'
    ) att on true
    left join lateral (
      select count(*) as favorite_count
      from public.favorite f
      where f.event_id = e.id and f.deleted_at is null
    ) fv on true
    where
      ((p_min_price is null and p_max_price is null)
        or coalesce(tk.in_price_range, coalesce(p_min_price, 0) <= 0))
      and (p_start_date is null or coalesce(occ.next_starts_at, e.starts_at) >= p_start_date)
      and (p_end_date is null or coalesce(occ.next_starts_at, e.starts_at) <= p_end_date)
      and (p_min_rating is null or coalesce(rv.avg_rating, 0) >= p_min_rating)
      and (v_types is null
           or exists (select 1 from unnest(v_types) t
                      where e.event_type ilike '%' || public._search_like_escape(t) || '%' escape '\'))
  )
  select
    s.id, s.title, s.starts_at, s.ends_at, s.address, s.min_price, s.currency, s.avg_rating,
    s.event_code, s.distance_km, s.flyer_public_id, s.flyer_version, s.capacity,
    s.attendance_count, s.created_at, s.occurrences, s.location, s.event_category, s.status,
    s.organizer_id, s.organizer_username, s.organizer_verified, s.is_new, s.score, v_as_of,
    s.event_timezone, s.event_country_code
  from scored s
  where p_cursor_id is null
     or s.score < p_cursor_score
     or (s.score = p_cursor_score and s.id > p_cursor_id)
  order by s.score desc, s.id asc
  limit v_size + 1;
end;
$function$;

revoke all on function public.search_events(p_query text, p_lat double precision, p_lng double precision, p_radius_km double precision, p_category text, p_types text[], p_min_price numeric, p_max_price numeric, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_min_rating numeric, p_organizer_id uuid, p_as_of timestamp with time zone, p_cursor_score numeric, p_cursor_id uuid, p_page_size integer) from public, anon, authenticated;
grant execute on function public.search_events(p_query text, p_lat double precision, p_lng double precision, p_radius_km double precision, p_category text, p_types text[], p_min_price numeric, p_max_price numeric, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_min_rating numeric, p_organizer_id uuid, p_as_of timestamp with time zone, p_cursor_score numeric, p_cursor_id uuid, p_page_size integer) to anon, authenticated, service_role;

drop function if exists public.recommendation_digest_email_items(p_notification_id uuid);

CREATE OR REPLACE FUNCTION public.recommendation_digest_email_items(p_notification_id uuid)
 RETURNS TABLE(subject_type text, subject_id uuid, reason_kind text, title text, subtitle text, starts_at timestamp with time zone, image_public_id text, image_version text, path text, organizer_username text, timezone text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select r.subject_type, r.subject_id, r.reason_kind,
         coalesce(ev.title, pl.name),
         case when r.subject_type = 'event'
              then coalesce(evpl.name, ev.address ->> 'full_address')
              else coalesce(pc.name, pl.address ->> 'full_address') end,
         case when r.subject_type = 'event'
              then coalesce((select min(o.starts_at) from public.event_occurrence o
                             where o.event_id = ev.id and o.ends_at > now()), ev.starts_at) end,
         coalesce(ev.flyer_public_id, pl.cover_public_id),
         coalesce(ev.flyer_version::text, pl.cover_version::text),
         case when r.subject_type = 'event'
              then '/events/' || lower(ev.event_code)
              else '/places/' || pl.slug end,
         org.username::text,
         ev.timezone::text
  from public.recommendation_digest g
  join public.recommendation r on r.digest_id = g.id
  left join public.event ev on r.subject_type = 'event' and ev.id = r.subject_id
  left join public.place evpl on evpl.id = ev.place_id
  left join public.user_info org on org.id = ev.organizer_id
  left join public.place pl on r.subject_type = 'place' and pl.id = r.subject_id
  left join public.place_category pc on pc.id = pl.category_id
  where g.notification_id = p_notification_id
    and not g.is_shadow
    and r.status in ('batched', 'notified')
    and public._recommendation_subject_suppression(r.subject_type, r.subject_id) is null
    and public._recommendation_email_allowed(r.user_id, r.reason_kind)
    and (r.subscription_id is null or exists (
          select 1 from public.notification_subscription ns
          where ns.id = r.subscription_id and ns.status = 'active'))
  order by r.score desc, r.id
  limit 5;
$function$;

revoke all on function public.recommendation_digest_email_items(p_notification_id uuid) from public, anon, authenticated;
grant execute on function public.recommendation_digest_email_items(p_notification_id uuid) to service_role;
