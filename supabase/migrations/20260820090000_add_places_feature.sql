-- Places feature (Phase 1): a second first-class content type alongside
-- Event. See PROJECT.md / the "Places Discovery" implementation plan for
-- the full rationale. Key decisions, recorded here for future readers:
--
-- 1. No RLS on any of these new tables -- matches every existing table in
--    this schema (event, favorite, review, etc. are all GRANT ALL to
--    anon/authenticated/service_role with no RLS), confirmed as a
--    deliberate choice rather than an oversight, so Places isn't a
--    two-tier security model relative to the rest of the app. Server
--    Actions remain the only enforcement layer, same as everywhere else.
-- 2. No partitioning on any new table. Several existing HASH/RANGE
--    partitioned tables (event_media, wallet, story, event_share,
--    media_audit) were pulled from production with zero partitions
--    defined, meaning inserts into them fail outright (see PROJECT.md
--    Sec7.5). Plain tables sidestep that entire failure class.
-- 3. place_category is a real lookup table (not a hardcoded TS array like
--    src/data/eventCategoriesAndTypes.ts) because categories need to be
--    addable without a schema change, per the Places spec.
-- 4. place_review is a separate table from the existing `review` table,
--    not a shared/polymorphic one. `review.reviewed_id` is hard-wired to
--    target a user_info row (person-to-person, e.g. attendee->organizer),
--    with an organizer-attendance gate baked into postReview.ts's
--    application logic -- reusing it for places would mean unpicking that
--    gate. UNIQUE(place_id, reviewer_id) enforces "one review per user per
--    place" at the database level.
-- 5. favorite_place mirrors the existing `favorite` table's shape/style
--    rather than adding a polymorphic target_type column to `favorite`,
--    which would require touching every existing favorite action.

CREATE TABLE public.place_category (
  id   smallint PRIMARY KEY,
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE
);

GRANT ALL ON public.place_category TO anon;
GRANT ALL ON public.place_category TO authenticated;
GRANT ALL ON public.place_category TO service_role;

INSERT INTO public.place_category (id, name, slug) VALUES
  (1,  'Restaurant',    'restaurant'),
  (2,  'Food Spot',     'food-spot'),
  (3,  'Pub',           'pub'),
  (4,  'Nightclub',     'nightclub'),
  (5,  'Gaming Center', 'gaming-center'),
  (6,  'Cinema',        'cinema'),
  (7,  'Gym/Fitness',   'gym-fitness'),
  (8,  'Hotel',         'hotel'),
  (9,  'Supermarket',   'supermarket'),
  (10, 'Skating',       'skating'),
  (11, 'Go-Karting',    'go-karting'),
  (12, 'Entertainment', 'entertainment'),
  (13, 'Recreation',    'recreation'),
  (14, 'Other',         'other');

CREATE TABLE public.place (
  id                          uuid                             DEFAULT extensions.uuid_generate_v4() NOT NULL,
  client_request_id           uuid,
  owner_id                    uuid                             NOT NULL,
  name                        text                             NOT NULL,
  slug                        text                             NOT NULL,
  description                 text                             NOT NULL,
  category_id                 smallint                         NOT NULL,
  location                    extensions.geography(Point,4326) NOT NULL,
  address                     jsonb                            NOT NULL,
  website_url                 text,
  phone                       text,
  whatsapp                    text,
  social_links                jsonb,
  cover_public_id             text                             NOT NULL,
  cover_version                character varying(10)           NOT NULL,
  status                      text                             DEFAULT 'published' NOT NULL,
  temporary_status            text,
  temporary_status_note       text,
  claimed                     boolean                          DEFAULT false NOT NULL,
  verified                    boolean                          DEFAULT false NOT NULL,
  created_at                  timestamp with time zone         DEFAULT now() NOT NULL,
  updated_at                  timestamp with time zone         DEFAULT now() NOT NULL
);

ALTER TABLE public.place ADD CONSTRAINT place_pkey PRIMARY KEY (id);
ALTER TABLE public.place ADD CONSTRAINT place_slug_key UNIQUE (slug);
ALTER TABLE public.place ADD CONSTRAINT place_client_request_id_key UNIQUE (client_request_id);
ALTER TABLE public.place ADD CONSTRAINT place_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.user_info(id) ON DELETE CASCADE;
ALTER TABLE public.place ADD CONSTRAINT place_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.place_category(id);
ALTER TABLE public.place ADD CONSTRAINT place_description_check CHECK (length(description) <= 2000);
ALTER TABLE public.place ADD CONSTRAINT place_cover_public_id_check CHECK (cover_public_id ~* '^[a-z0-9_/-]+$'::text);
ALTER TABLE public.place ADD CONSTRAINT place_status_check
  CHECK (status = ANY (ARRAY['draft', 'published', 'archived']));
ALTER TABLE public.place ADD CONSTRAINT place_temporary_status_check
  CHECK (temporary_status IS NULL OR temporary_status = ANY (ARRAY['temporarily_closed', 'permanently_closed']));

GRANT ALL ON public.place TO anon;
GRANT ALL ON public.place TO authenticated;
GRANT ALL ON public.place TO service_role;

CREATE INDEX idx_place_geo ON public.place USING gist (location);
CREATE INDEX idx_place_owner_id ON public.place (owner_id);
CREATE INDEX idx_place_category_id ON public.place (category_id);
CREATE INDEX idx_place_status ON public.place (status);

CREATE TABLE public.place_photo (
  id         uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  place_id   uuid                     NOT NULL,
  public_id  text                     NOT NULL,
  version    character varying(10)    NOT NULL,
  position   integer                  DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.place_photo ADD CONSTRAINT place_photo_pkey PRIMARY KEY (id);
ALTER TABLE public.place_photo ADD CONSTRAINT place_photo_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.place(id) ON DELETE CASCADE;
ALTER TABLE public.place_photo ADD CONSTRAINT place_photo_public_id_check CHECK (public_id ~* '^[a-z0-9_/-]+$'::text);

GRANT ALL ON public.place_photo TO anon;
GRANT ALL ON public.place_photo TO authenticated;
GRANT ALL ON public.place_photo TO service_role;

CREATE INDEX idx_place_photo_place_id ON public.place_photo (place_id, position);

CREATE TABLE public.place_opening_hours (
  id          uuid    DEFAULT extensions.uuid_generate_v4() NOT NULL,
  place_id    uuid    NOT NULL,
  day_of_week smallint NOT NULL,
  open_time   time,
  close_time  time,
  is_closed   boolean DEFAULT false NOT NULL
);

ALTER TABLE public.place_opening_hours ADD CONSTRAINT place_opening_hours_pkey PRIMARY KEY (id);
ALTER TABLE public.place_opening_hours ADD CONSTRAINT place_opening_hours_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.place(id) ON DELETE CASCADE;
ALTER TABLE public.place_opening_hours ADD CONSTRAINT place_opening_hours_day_check CHECK (day_of_week BETWEEN 0 AND 6);
ALTER TABLE public.place_opening_hours ADD CONSTRAINT place_opening_hours_range_check
  CHECK (is_closed OR (open_time IS NOT NULL AND close_time IS NOT NULL));

GRANT ALL ON public.place_opening_hours TO anon;
GRANT ALL ON public.place_opening_hours TO authenticated;
GRANT ALL ON public.place_opening_hours TO service_role;

CREATE INDEX idx_place_opening_hours_place_id ON public.place_opening_hours (place_id, day_of_week);

CREATE TABLE public.place_service (
  id          uuid    DEFAULT extensions.uuid_generate_v4() NOT NULL,
  place_id    uuid    NOT NULL,
  name        text    NOT NULL,
  description text,
  price       numeric,
  price_unit  text,
  show_price  boolean DEFAULT true NOT NULL,
  position    integer DEFAULT 0 NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.place_service ADD CONSTRAINT place_service_pkey PRIMARY KEY (id);
ALTER TABLE public.place_service ADD CONSTRAINT place_service_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.place(id) ON DELETE CASCADE;
ALTER TABLE public.place_service ADD CONSTRAINT place_service_price_check CHECK (price IS NULL OR price >= 0);

GRANT ALL ON public.place_service TO anon;
GRANT ALL ON public.place_service TO authenticated;
GRANT ALL ON public.place_service TO service_role;

CREATE INDEX idx_place_service_place_id ON public.place_service (place_id, position);

CREATE TABLE public.place_review (
  id                 uuid    DEFAULT extensions.uuid_generate_v4() NOT NULL,
  place_id           uuid    NOT NULL,
  reviewer_id        uuid    NOT NULL,
  rating             smallint NOT NULL,
  title              text,
  comment            text,
  status             text    DEFAULT 'approved' NOT NULL,
  owner_response     text,
  owner_response_at  timestamp with time zone,
  created_at         timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.place_review ADD CONSTRAINT place_review_pkey PRIMARY KEY (id);
ALTER TABLE public.place_review ADD CONSTRAINT place_review_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.place(id) ON DELETE CASCADE;
ALTER TABLE public.place_review ADD CONSTRAINT place_review_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.user_info(id) ON DELETE CASCADE;
ALTER TABLE public.place_review ADD CONSTRAINT place_review_rating_check CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE public.place_review ADD CONSTRAINT place_review_comment_check CHECK (comment IS NULL OR length(comment) <= 500);
ALTER TABLE public.place_review ADD CONSTRAINT place_review_status_check
  CHECK (status = ANY (ARRAY['pending', 'approved', 'rejected']));
ALTER TABLE public.place_review ADD CONSTRAINT place_review_unique_reviewer UNIQUE (place_id, reviewer_id);

GRANT ALL ON public.place_review TO anon;
GRANT ALL ON public.place_review TO authenticated;
GRANT ALL ON public.place_review TO service_role;

CREATE INDEX idx_place_review_place_id ON public.place_review (place_id, created_at);

CREATE TABLE public.place_report (
  id          uuid    DEFAULT extensions.uuid_generate_v4() NOT NULL,
  place_id    uuid,
  review_id   uuid,
  reporter_id uuid    NOT NULL,
  reason      text    NOT NULL,
  status      text    DEFAULT 'pending' NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.place_report ADD CONSTRAINT place_report_pkey PRIMARY KEY (id);
ALTER TABLE public.place_report ADD CONSTRAINT place_report_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.place(id) ON DELETE CASCADE;
ALTER TABLE public.place_report ADD CONSTRAINT place_report_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.place_review(id) ON DELETE CASCADE;
ALTER TABLE public.place_report ADD CONSTRAINT place_report_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.user_info(id) ON DELETE CASCADE;
ALTER TABLE public.place_report ADD CONSTRAINT place_report_target_check
  CHECK ((place_id IS NOT NULL) OR (review_id IS NOT NULL));
ALTER TABLE public.place_report ADD CONSTRAINT place_report_status_check
  CHECK (status = ANY (ARRAY['pending', 'reviewed', 'dismissed']));

GRANT ALL ON public.place_report TO anon;
GRANT ALL ON public.place_report TO authenticated;
GRANT ALL ON public.place_report TO service_role;

CREATE TABLE public.favorite_place (
  id         uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id    uuid                     NOT NULL,
  place_id   uuid                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.favorite_place ADD CONSTRAINT favorite_place_pkey PRIMARY KEY (id);
ALTER TABLE public.favorite_place ADD CONSTRAINT favorite_place_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_info(id) ON DELETE CASCADE;
ALTER TABLE public.favorite_place ADD CONSTRAINT favorite_place_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.place(id) ON DELETE CASCADE;
ALTER TABLE public.favorite_place ADD CONSTRAINT favorite_place_unique UNIQUE (user_id, place_id);

GRANT ALL ON public.favorite_place TO anon;
GRANT ALL ON public.favorite_place TO authenticated;
GRANT ALL ON public.favorite_place TO service_role;

CREATE INDEX idx_favorite_place_user_id ON public.favorite_place (user_id, created_at);

CREATE TABLE public.place_analytics_event (
  id         uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  place_id   uuid                     NOT NULL,
  event_type text                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.place_analytics_event ADD CONSTRAINT place_analytics_event_pkey PRIMARY KEY (id);
ALTER TABLE public.place_analytics_event ADD CONSTRAINT place_analytics_event_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.place(id) ON DELETE CASCADE;
ALTER TABLE public.place_analytics_event ADD CONSTRAINT place_analytics_event_type_check
  CHECK (event_type = ANY (ARRAY['view', 'direction_click', 'phone_click', 'whatsapp_click', 'website_click', 'booking_click']));

GRANT ALL ON public.place_analytics_event TO anon;
GRANT ALL ON public.place_analytics_event TO authenticated;
GRANT ALL ON public.place_analytics_event TO service_role;

CREATE INDEX idx_place_analytics_event_place_id ON public.place_analytics_event (place_id, event_type, created_at);

-- Event <-> Place relationship: an event can optionally happen at a Place.
-- Nullable and additive -- no impact on existing rows/queries.
ALTER TABLE public.event ADD COLUMN place_id uuid;
ALTER TABLE public.event ADD CONSTRAINT event_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.place(id) ON DELETE SET NULL;
CREATE INDEX idx_event_place_id ON public.event (place_id);

-- create_place: atomic multi-table insert (place + opening_hours +
-- services), mirroring create_event's transactional/idempotent shape
-- (20260816232000_atomic_event_creation_and_scoped_promo_codes.sql) so a
-- failure partway through rolls back everything, and a client retry
-- carrying the same client_request_id is a no-op instead of a duplicate.
CREATE FUNCTION public.create_place (
  p_client_request_id uuid,
  p_owner_id          uuid,
  p_name              text,
  p_slug              text,
  p_description       text,
  p_category_id       smallint,
  p_latitude          double precision,
  p_longitude         double precision,
  p_address           jsonb,
  p_website_url       text,
  p_phone             text,
  p_whatsapp          text,
  p_social_links      jsonb,
  p_cover_public_id   text,
  p_cover_version     text,
  p_opening_hours     jsonb, -- [{day_of_week, open_time, close_time, is_closed}] or null
  p_services          jsonb  -- [{name, description, price, price_unit, show_price}] or null
)
  RETURNS uuid
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_place_id uuid;
BEGIN
  SELECT id INTO v_place_id FROM place WHERE client_request_id = p_client_request_id;
  IF v_place_id IS NOT NULL THEN
    RETURN v_place_id;
  END IF;

  INSERT INTO place (
    client_request_id, owner_id, name, slug, description, category_id,
    location, address, website_url, phone, whatsapp, social_links,
    cover_public_id, cover_version, status, created_at, updated_at
  )
  VALUES (
    p_client_request_id, p_owner_id, p_name, p_slug, p_description, p_category_id,
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::extensions.geography,
    p_address, p_website_url, p_phone, p_whatsapp, p_social_links,
    p_cover_public_id, p_cover_version, 'published', now(), now()
  )
  ON CONFLICT (client_request_id) DO NOTHING
  RETURNING id INTO v_place_id;

  IF v_place_id IS NULL THEN
    SELECT id INTO v_place_id FROM place WHERE client_request_id = p_client_request_id;
    RETURN v_place_id;
  END IF;

  IF p_opening_hours IS NOT NULL AND jsonb_array_length(p_opening_hours) > 0 THEN
    INSERT INTO place_opening_hours (place_id, day_of_week, open_time, close_time, is_closed)
    SELECT
      v_place_id,
      (elem->>'day_of_week')::smallint,
      NULLIF(elem->>'open_time', '')::time,
      NULLIF(elem->>'close_time', '')::time,
      COALESCE((elem->>'is_closed')::boolean, false)
    FROM jsonb_array_elements(p_opening_hours) elem;
  END IF;

  IF p_services IS NOT NULL AND jsonb_array_length(p_services) > 0 THEN
    INSERT INTO place_service (place_id, name, description, price, price_unit, show_price, position)
    SELECT
      v_place_id,
      elem->>'name',
      elem->>'description',
      NULLIF(elem->>'price', '')::numeric,
      elem->>'price_unit',
      COALESCE((elem->>'show_price')::boolean, true),
      ord - 1
    FROM jsonb_array_elements(p_services) WITH ORDINALITY AS t(elem, ord);
  END IF;

  RETURN v_place_id;
END;
$function$;

GRANT ALL ON FUNCTION public.create_place(
  uuid, uuid, text, text, text, smallint, double precision, double precision,
  jsonb, text, text, text, jsonb, text, text, jsonb, jsonb
) TO anon;
GRANT ALL ON FUNCTION public.create_place(
  uuid, uuid, text, text, text, smallint, double precision, double precision,
  jsonb, text, text, text, jsonb, text, text, jsonb, jsonb
) TO authenticated;
GRANT ALL ON FUNCTION public.create_place(
  uuid, uuid, text, text, text, smallint, double precision, double precision,
  jsonb, text, text, text, jsonb, text, text, jsonb, jsonb
) TO service_role;

-- place_is_open_now: single source of truth for "is this place open right
-- now", reused by get_filtered_places's "open now" filter. This app has no
-- per-place timezone column (matches the existing Ghana-centric,
-- single-timezone assumption already made elsewhere, e.g. proxy.ts's
-- default country code) so "now" is evaluated in the database's session
-- timezone. Overnight ranges (close_time < open_time, e.g. 6pm-2am) are
-- handled explicitly.
CREATE FUNCTION public.place_is_open_now (p_place_id uuid, p_now timestamptz DEFAULT now())
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  AS $function$
DECLARE
  v_temporary_status text;
  v_dow smallint;
  v_time time;
  v_is_open boolean;
BEGIN
  SELECT temporary_status INTO v_temporary_status FROM place WHERE id = p_place_id;
  IF v_temporary_status IS NOT NULL THEN
    RETURN false;
  END IF;

  v_dow := EXTRACT(DOW FROM p_now);
  v_time := p_now::time;

  SELECT EXISTS (
    SELECT 1 FROM place_opening_hours h
    WHERE h.place_id = p_place_id
      AND NOT h.is_closed
      AND h.day_of_week = v_dow
      AND (
        (h.close_time > h.open_time AND v_time BETWEEN h.open_time AND h.close_time)
        OR (h.close_time <= h.open_time AND v_time >= h.open_time)
      )
  ) OR EXISTS (
    -- overnight range that started yesterday and is still open past midnight
    SELECT 1 FROM place_opening_hours h
    WHERE h.place_id = p_place_id
      AND NOT h.is_closed
      AND h.day_of_week = ((v_dow + 6) % 7)
      AND h.close_time <= h.open_time
      AND v_time < h.close_time
  ) INTO v_is_open;

  RETURN COALESCE(v_is_open, false);
END;
$function$;

GRANT ALL ON FUNCTION public.place_is_open_now(uuid, timestamptz) TO anon;
GRANT ALL ON FUNCTION public.place_is_open_now(uuid, timestamptz) TO authenticated;
GRANT ALL ON FUNCTION public.place_is_open_now(uuid, timestamptz) TO service_role;

-- get_nearby_places: mirrors get_nearby_events's shape (PostGIS radius
-- search, keyset pagination on (distance_km, id)).
CREATE FUNCTION public.get_nearby_places (
  user_lat          double precision,
  user_lng          double precision,
  search_radius     double precision,
  p_cursor_distance double precision DEFAULT NULL,
  p_cursor_id       uuid DEFAULT NULL,
  p_page_size       integer DEFAULT 20
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
    cursor_distance_km     double precision
  )
  LANGUAGE plpgsql
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

GRANT ALL ON FUNCTION public.get_nearby_places(double precision, double precision, double precision, double precision, uuid, integer) TO anon;
GRANT ALL ON FUNCTION public.get_nearby_places(double precision, double precision, double precision, double precision, uuid, integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_nearby_places(double precision, double precision, double precision, double precision, uuid, integer) TO service_role;

-- get_filtered_places: mirrors get_filtered_events's shape (search text,
-- category, rating, distance, plus a Places-specific "open now" filter).
CREATE FUNCTION public.get_filtered_places (
  p_search_text     text DEFAULT NULL,
  p_category_id     smallint DEFAULT NULL,
  p_min_rating      numeric DEFAULT NULL,
  p_open_now        boolean DEFAULT NULL,
  p_user_lat        double precision DEFAULT NULL,
  p_user_lng        double precision DEFAULT NULL,
  p_max_distance_km double precision DEFAULT NULL,
  p_cursor_distance double precision DEFAULT NULL,
  p_cursor_id       uuid DEFAULT NULL,
  p_page_size       integer DEFAULT 20
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
    cursor_distance_km     double precision
  )
  LANGUAGE plpgsql
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

GRANT ALL ON FUNCTION public.get_filtered_places(
  text, smallint, numeric, boolean, double precision, double precision,
  double precision, double precision, uuid, integer
) TO anon;
GRANT ALL ON FUNCTION public.get_filtered_places(
  text, smallint, numeric, boolean, double precision, double precision,
  double precision, double precision, uuid, integer
) TO authenticated;
GRANT ALL ON FUNCTION public.get_filtered_places(
  text, smallint, numeric, boolean, double precision, double precision,
  double precision, double precision, uuid, integer
) TO service_role;
