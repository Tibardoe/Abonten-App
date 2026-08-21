-- Places feature Phase 2, Milestone 5: Featured Places read side.
-- PostgREST's query builder has no way to express `ORDER BY random()` (its
-- .order() only takes a column name), so -- same precedent as
-- get_nearby_places/get_filtered_places already being RPCs specifically
-- because the query builder can't express what they need -- this is a third
-- RPC in that family. Purely additive: no existing table/column/RPC is
-- altered.
--
-- DISTINCT ON (place_id) collapses the (rare, but possible -- an owner could
-- buy a second promotion while one is still active) case of more than one
-- currently-active place_promotion row for the same place down to the
-- longest-running one, before the random ordering/limit is applied, so a
-- place never appears twice in one result set.
CREATE FUNCTION public.get_active_place_promotions (
  p_user_lat        double precision DEFAULT NULL,
  p_user_lng        double precision DEFAULT NULL,
  p_max_distance_km double precision DEFAULT NULL,
  p_limit           integer DEFAULT 10
)
  RETURNS TABLE (
    id                     uuid,
    owner_id               uuid,
    name                   text,
    slug                   text,
    description            text,
    category_id            smallint,
    category_name          text,
    category_slug          text,
    location               extensions.geography,
    address                jsonb,
    website_url            text,
    phone                  text,
    whatsapp               text,
    cover_public_id        text,
    cover_version          character varying,
    status                 text,
    temporary_status       text,
    claimed                boolean,
    verified               boolean,
    created_at             timestamp with time zone,
    avg_rating             numeric,
    review_count           bigint,
    is_open                boolean,
    distance_km            double precision,
    promotion_ends_at      timestamp with time zone
  )
  LANGUAGE plpgsql
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
    WHERE r.place_id = p.id AND r.status = 'approved'
  ) review_data ON TRUE
  WHERE
    p.status = 'published'
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

GRANT ALL ON FUNCTION public.get_active_place_promotions(double precision, double precision, double precision, integer) TO anon;
GRANT ALL ON FUNCTION public.get_active_place_promotions(double precision, double precision, double precision, integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_active_place_promotions(double precision, double precision, double precision, integer) TO service_role;
