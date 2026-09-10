-- Three findings the 2026-09-09 audit reported but did not change, now
-- settled, plus the data the "Top-rated organizers" slider needs to exist.

-- ---------------------------------------------------------------------
-- 1. Place list ratings counted hidden / removed reviews.
--
-- get_place_rating (the detail figure) excludes reviews a moderator has
-- hidden or removed; get_filtered_places, get_nearby_places and
-- get_active_place_promotions (the list figures) only checked
-- status = 'approved'. A place whose worst review had been hidden showed
-- one average on the card and another on its page. Same predicate now in
-- all four places — the class of inconsistency 20260909130000 fixed for
-- events.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_filtered_places(p_search_text text DEFAULT NULL::text, p_category_id smallint DEFAULT NULL::smallint, p_min_rating numeric DEFAULT NULL::numeric, p_open_now boolean DEFAULT NULL::boolean, p_user_lat double precision DEFAULT NULL::double precision, p_user_lng double precision DEFAULT NULL::double precision, p_max_distance_km double precision DEFAULT NULL::double precision, p_cursor_distance double precision DEFAULT NULL::double precision, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 20)
RETURNS TABLE(id uuid, owner_id uuid, name text, slug text, description text, category_id smallint, category_name text, category_slug text, location geography, address jsonb, website_url text, phone text, whatsapp text, cover_public_id text, cover_version character varying, status text, temporary_status text, claimed boolean, verified boolean, created_at timestamp with time zone, avg_rating numeric, review_count bigint, is_open boolean, distance_km double precision, cursor_distance_km double precision)
LANGUAGE plpgsql
SECURITY DEFINER
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
      WHERE r.place_id = p.id
        AND r.status = 'approved'
        AND r.moderation_state IS DISTINCT FROM 'hidden'
        AND r.moderation_state IS DISTINCT FROM 'removed'
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

CREATE OR REPLACE FUNCTION public.get_nearby_places(user_lat double precision, user_lng double precision, search_radius double precision, p_cursor_distance double precision DEFAULT NULL::double precision, p_cursor_id uuid DEFAULT NULL::uuid, p_page_size integer DEFAULT 20)
RETURNS TABLE(id uuid, owner_id uuid, name text, slug text, description text, category_id smallint, category_name text, category_slug text, location geography, address jsonb, website_url text, phone text, whatsapp text, cover_public_id text, cover_version character varying, status text, temporary_status text, claimed boolean, verified boolean, created_at timestamp with time zone, avg_rating numeric, review_count bigint, is_open boolean, distance_km double precision, cursor_distance_km double precision)
LANGUAGE plpgsql
SECURITY DEFINER
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
      WHERE r.place_id = p.id
        AND r.status = 'approved'
        AND r.moderation_state IS DISTINCT FROM 'hidden'
        AND r.moderation_state IS DISTINCT FROM 'removed'
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

CREATE OR REPLACE FUNCTION public.get_active_place_promotions(p_user_lat double precision DEFAULT NULL::double precision, p_user_lng double precision DEFAULT NULL::double precision, p_max_distance_km double precision DEFAULT NULL::double precision, p_limit integer DEFAULT 10)
RETURNS TABLE(id uuid, owner_id uuid, name text, slug text, description text, category_id smallint, category_name text, category_slug text, location geography, address jsonb, website_url text, phone text, whatsapp text, cover_public_id text, cover_version character varying, status text, temporary_status text, claimed boolean, verified boolean, created_at timestamp with time zone, avg_rating numeric, review_count bigint, is_open boolean, distance_km double precision, promotion_ends_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH active_promo AS (
    SELECT DISTINCT ON (place_id) place_id, ends_at
    FROM place_promotion
    WHERE ends_at > now()
    ORDER BY place_id, ends_at DESC
  )
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
    END AS distance_km,
    ap.ends_at AS promotion_ends_at
  FROM active_promo ap
  JOIN place p ON p.id = ap.place_id
  JOIN place_category pc ON pc.id = p.category_id
  LEFT JOIN LATERAL (
    SELECT AVG(r.rating)::numeric AS avg_rating, COUNT(*) AS review_count
    FROM place_review r
    WHERE r.place_id = p.id
      AND r.status = 'approved'
      AND r.moderation_state IS DISTINCT FROM 'hidden'
      AND r.moderation_state IS DISTINCT FROM 'removed'
  ) review_data ON TRUE
  WHERE
    p.status = 'published'
    AND p.moderation_state IS DISTINCT FROM 'hidden'
    AND p.moderation_state IS DISTINCT FROM 'removed'
    AND (
      p_max_distance_km IS NULL OR p_user_lat IS NULL OR p_user_lng IS NULL
      OR ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(p_user_lng, p_user_lat), 4326), p_max_distance_km * 1000)
    )
  -- The whole point of this RPC: a real, per-request random ordering so no
  -- single advertiser can buy the top slot and permanently keep it.
  ORDER BY random()
  LIMIT p_limit;
END;
$function$;

-- ---------------------------------------------------------------------
-- 2. Legacy avatars could never be set again.
--
-- trg_user_info_avatar_owner (20260903202223) requires a CHANGED
-- avatar_public_id to sit under user_profiles/<id>/. Every avatar that
-- predates that rule is a flat user_profiles/<random> path -- all six real
-- users today -- so restoring a previous photo (support, or an eventual
-- in-app "previous photos" picker) is rejected with a check_violation. The
-- audit hit exactly this restoring the owner's avatar and had to disable
-- the trigger to do it.
--
-- The rule's purpose is to stop a user pointing their avatar at someone
-- else's asset. A path that appears in the user's OWN user_image_history is
-- provably theirs, so it is accepted too. New uploads still land under the
-- owner folder and are still enforced.
--
-- Backfill: the current legacy avatars were never written to history (the
-- INSERT policy was missing until 20260909115349), so each is recorded once
-- now, or it could never be restored after the next change.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_avatar_public_id_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
begin
  if new.avatar_public_id is not null
     and (tg_op = 'INSERT'
          or new.avatar_public_id is distinct from old.avatar_public_id)
     and new.avatar_public_id not like ('user_profiles/' || new.id::text || '/%')
     and not exists (
       select 1 from public.user_image_history h
       where h.user_id = new.id
         and h.public_id = new.avatar_public_id
     )
  then
    raise exception
      'avatar_public_id must sit under this user''s own user_profiles/<id>/ folder'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

INSERT INTO public.user_image_history (user_id, public_id, version, created_at)
SELECT ui.id, ui.avatar_public_id, ui.avatar_version, now()
FROM public.user_info ui
WHERE ui.avatar_public_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_image_history h
    WHERE h.user_id = ui.id AND h.public_id = ui.avatar_public_id
  );

-- ---------------------------------------------------------------------
-- 3. "Top-rated organizers" had nothing to rank by.
--
-- The slider reused the plain nearby list unchanged (documented gap). The
-- organizer's rating -- review.reviewed_id, with get_user_rating's
-- visibility predicate -- is computed once per distinct organizer on the
-- page and appended to get_nearby_events, so both apps can rank client-side
-- from the same fetch the other sliders already share. Return type change
-- => drop + recreate + re-grant (as in 20260910163552).
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
RETURNS TABLE(id uuid, organizer_id uuid, event_category text, event_type text, title text, slug text, location geography, address jsonb, website_url text, capacity integer, flyer_public_id text, flyer_version character varying, starts_at timestamp with time zone, ends_at timestamp with time zone, status character varying, created_at timestamp with time zone, event_code text, min_price numeric, currency text, occurrences json, featured boolean, cursor_sort_key timestamp with time zone, attendance_count bigint, ticket_types json, organizer_avg_rating numeric, organizer_rating_count integer)
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
  ),
  -- One pass over `review` for the page's distinct organizers (same
  -- predicate as get_user_rating), not one per event row.
  organizer_rating as (
    select
      r.reviewed_id,
      avg(r.rating)::numeric as avg_rating,
      count(*)::integer as rating_count
    from review r
    where r.reviewed_id in (
      select distinct e2.organizer_id from page p2 join event e2 on e2.id = p2.id
    )
      and r.status = 'approved'
      and r.moderation_state is distinct from 'hidden'
      and r.moderation_state is distinct from 'removed'
    group by r.reviewed_id
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
    ticket_data.ticket_types,
    coalesce(orr.avg_rating, 0)::numeric as organizer_avg_rating,
    coalesce(orr.rating_count, 0)::integer as organizer_rating_count
  from page p
  join event e on e.id = p.id
  left join organizer_rating orr on orr.reviewed_id = e.organizer_id
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
