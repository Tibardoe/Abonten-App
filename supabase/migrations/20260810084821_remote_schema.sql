-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP EXTENSION pg_graphql;

CREATE ROLE supabase_privileged_role;

GRANT supabase_privileged_role TO postgres;

CREATE EXTENSION citext WITH SCHEMA extensions;

CREATE EXTENSION pg_prewarm WITH SCHEMA extensions;

CREATE EXTENSION postgis WITH SCHEMA extensions;

CREATE EXTENSION pg_cron WITH SCHEMA pg_catalog;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

CREATE SEQUENCE public.subscription_plan_id_seq AS smallint MAXVALUE 32767;

CREATE SEQUENCE public.transaction_status_id_seq AS smallint MAXVALUE 32767;

CREATE SEQUENCE public.user_status_id_seq AS smallint MAXVALUE 32767;

CREATE FUNCTION public.create_user_info_if_not_exists()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
begin
  -- Insert only if the user does not already exist in user_info
  insert into public.user_info (
    id,
    status_id,
    username,
    full_name,
    avatar_public_id,
    avatar_version,
    bio,
    updated_at
  )
  select
    new.id,
    1,  -- Default status: active
    left(
      regexp_replace(
        coalesce(
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'email',
          new.raw_user_meta_data->>'phone',
          'user_' || new.id
        ),
        '[^a-zA-Z0-9_]',
        '_',
        'g'
      ),
      20
    ) as username,
    coalesce(new.raw_user_meta_data->>'full_name', null) as full_name,
    null,
    null,
    null,
    now()
  where not exists (
    select 1 from public.user_info where id = new.id
  );

  return new;
end;
$function$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_user_info_if_not_exists();

GRANT ALL ON FUNCTION public.create_user_info_if_not_exists() TO anon;

GRANT ALL ON FUNCTION public.create_user_info_if_not_exists() TO authenticated;

GRANT ALL ON FUNCTION public.create_user_info_if_not_exists() TO service_role;

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
    created_at       timestamp with time zone,
    event_dates      timestamp with time zone[]
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
      SELECT COUNT(*) FROM attendance a
      WHERE a.event_id = e.id
    ) AS attendance_count,
    e.created_at,
    e.event_dates
  FROM
    event e
  LEFT JOIN ticket_type tt ON tt.event_id = e.id
  LEFT JOIN review r ON r.reviewed_id = e.id
  LEFT JOIN LATERAL (
    SELECT d AS next_date
    FROM unnest(e.event_dates) d
    WHERE d >= now()
    ORDER BY d ASC
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

CREATE FUNCTION public.get_nearby_events (
  user_lat      double precision,
  user_lng      double precision,
  search_radius double precision
)
  RETURNS TABLE (
    id              uuid,
    organizer_id    uuid,
    event_category  text,
    event_type      text,
    title           text,
    slug            text,
    description     text,
    location        extensions.geography,
    address         jsonb,
    website_url     text,
    capacity        integer,
    flyer_public_id text,
    flyer_version   character varying,
    starts_at       timestamp with time zone,
    ends_at         timestamp with time zone,
    status          character varying,
    created_at      timestamp with time zone,
    event_code      text,
    min_price       numeric,
    currency        text,
    occurrences     json
  )
  LANGUAGE plpgsql
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

    ticket_data.min_price,
    ticket_data.currency,

    occ_data.occurrences

  FROM event e

  -- Ticket aggregation
  LEFT JOIN LATERAL (
    SELECT 
      MIN(tt.price) AS min_price,
      MIN(tt.currency) AS currency
    FROM ticket_type tt
    WHERE tt.event_id = e.id
  ) ticket_data ON TRUE

  -- Occurrence aggregation (all dates)
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

    -- 🔥 Correct visibility logic
    AND (
      -- Has at least one future occurrence
      EXISTS (
        SELECT 1
        FROM event_occurrence o
        WHERE o.event_id = e.id
          AND o.ends_at > now()
      )

      -- OR has no occurrences and event date is future
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

  ORDER BY
    (
      SELECT MIN(o2.starts_at)
      FROM event_occurrence o2
      WHERE o2.event_id = e.id
        AND o2.ends_at > now()
    ) NULLS LAST,
    e.starts_at ASC;

END;
$function$;

GRANT ALL ON FUNCTION public.get_nearby_events(double precision, double precision, double precision) TO anon;

GRANT ALL ON FUNCTION public.get_nearby_events(double precision, double precision, double precision) TO authenticated;

GRANT ALL ON FUNCTION public.get_nearby_events(double precision, double precision, double precision) TO service_role;

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
    event_dates          timestamp with time zone[],
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
    e.event_dates,
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

CREATE FUNCTION public.log_user_changes()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
  INSERT INTO audit_log (user_id, action, details, ip_address, user_agent, created_at)
  VALUES (NEW.id, TG_OP, row_to_json(NEW), inet_client_addr(), current_setting('request.user_agent'), NOW());
  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.log_user_changes() TO anon;

GRANT ALL ON FUNCTION public.log_user_changes() TO authenticated;

GRANT ALL ON FUNCTION public.log_user_changes() TO service_role;

CREATE TABLE public.attendance (
  id                uuid                        DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id           uuid                        NOT NULL,
  event_id          uuid                        NOT NULL,
  ticket_type_id    uuid,
  status            text                        DEFAULT 'attending'::text,
  number_of_tickets integer                     NOT NULL,
  for_someone_else  boolean                     DEFAULT false,
  name              text,
  email             text,
  phone             text,
  created_at        timestamp without time zone DEFAULT now(),
  ticket_id         uuid
);

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_number_of_tickets_check CHECK (number_of_tickets >= 1);

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_status_check CHECK (status = ANY (ARRAY['attending'::text, 'cancelled'::text]));

GRANT ALL ON public.attendance TO anon;

GRANT ALL ON public.attendance TO authenticated;

GRANT ALL ON public.attendance TO service_role;

CREATE TABLE public.event (
  id                   uuid                             DEFAULT extensions.uuid_generate_v4() NOT NULL,
  organizer_id         uuid                             NOT NULL,
  event_category       text                             NOT NULL,
  event_type           text,
  title                text                             NOT NULL,
  slug                 text                             NOT NULL,
  description          text                             NOT NULL,
  location             extensions.geography(Point,4326) NOT NULL,
  address              jsonb                            NOT NULL,
  website_url          text,
  capacity             integer,
  flyer_public_id      text                             NOT NULL,
  flyer_version        character varying(10)            NOT NULL,
  starts_at            timestamp with time zone,
  ends_at              timestamp with time zone,
  status               character varying(10)            DEFAULT 'draft'::character varying NOT NULL,
  created_at           timestamp with time zone         DEFAULT now() NOT NULL,
  event_code           text                             NOT NULL,
  require_registration boolean                          DEFAULT false NOT NULL
);

ALTER TABLE public.event
  ADD CONSTRAINT event_capacity_check CHECK (capacity > 0);

ALTER TABLE public.event
  ADD CONSTRAINT event_check CHECK (ends_at > starts_at);

ALTER TABLE public.event
  ADD CONSTRAINT event_description_check CHECK (length(description) <= 2000);

ALTER TABLE public.event
  ADD CONSTRAINT event_event_code_key UNIQUE (event_code);

ALTER TABLE public.event
  ADD CONSTRAINT event_flyer_public_id_check CHECK (flyer_public_id ~* '^[a-z0-9_\/-]+$'::text);

ALTER TABLE public.event
  ADD CONSTRAINT event_pkey PRIMARY KEY (id);

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(id) ON DELETE CASCADE;

ALTER TABLE public.event
  ADD CONSTRAINT event_slug_key UNIQUE (slug);

ALTER TABLE public.event
  ADD CONSTRAINT event_status_check
    CHECK (status::text = ANY (ARRAY['draft'::character varying, 'published'::character varying, 'canceled'::character varying, 'completed'::character varying]::text[]));

GRANT ALL ON public.event TO anon;

GRANT ALL ON public.event TO authenticated;

GRANT ALL ON public.event TO service_role;

CREATE INDEX idx_event_geo ON public.event USING gist (location);

CREATE TABLE public.event_media (
  event_id   uuid                     NOT NULL,
  public_id  text                     NOT NULL,
  version    character varying(10)    NOT NULL,
  media_type character varying(10)    NOT NULL,
  width      integer,
  height     integer,
  duration   integer,
  format     character varying(10),
  created_at timestamp with time zone DEFAULT now() NOT NULL
) PARTITION BY HASH (event_id);

ALTER TABLE public.event_media
  ADD CONSTRAINT event_media_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(id) ON DELETE CASCADE;

ALTER TABLE public.event_media
  ADD CONSTRAINT event_media_media_type_check CHECK (media_type::text = ANY (ARRAY['image'::character varying, 'video'::character varying]::text[]));

ALTER TABLE public.event_media
  ADD CONSTRAINT event_media_pkey PRIMARY KEY (event_id, public_id);

ALTER TABLE public.event_media
  ADD CONSTRAINT event_media_public_id_check CHECK (public_id ~* '^[a-z0-9_\/-]+$'::text);

GRANT ALL ON public.event_media TO anon;

GRANT ALL ON public.event_media TO authenticated;

GRANT ALL ON public.event_media TO service_role;

CREATE TABLE public.event_occurrence (
  id        uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  event_id  uuid                     NOT NULL,
  starts_at timestamp with time zone NOT NULL,
  ends_at   timestamp with time zone NOT NULL
);

ALTER TABLE public.event_occurrence
  ADD CONSTRAINT event_occurrence_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(id) ON DELETE CASCADE;

ALTER TABLE public.event_occurrence
  ADD CONSTRAINT event_occurrence_pkey PRIMARY KEY (id);

ALTER TABLE public.event_occurrence
  ADD CONSTRAINT occurrence_time_check CHECK (ends_at > starts_at);

GRANT ALL ON public.event_occurrence TO anon;

GRANT ALL ON public.event_occurrence TO authenticated;

GRANT ALL ON public.event_occurrence TO service_role;

CREATE TABLE public.event_share (
  id        uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id   uuid                     NOT NULL,
  event_id  uuid                     NOT NULL,
  shared_at timestamp with time zone DEFAULT now() NOT NULL
) PARTITION BY RANGE (shared_at);

ALTER TABLE public.event_share
  ADD CONSTRAINT event_share_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(id) ON DELETE CASCADE;

ALTER TABLE public.event_share
  ADD CONSTRAINT event_share_pkey PRIMARY KEY (id, shared_at);

GRANT ALL ON public.event_share TO anon;

GRANT ALL ON public.event_share TO authenticated;

GRANT ALL ON public.event_share TO service_role;

CREATE TABLE public.favorite (
  user_id    uuid                     NOT NULL,
  event_id   uuid                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
) PARTITION BY HASH (user_id);

ALTER TABLE public.favorite
  ADD CONSTRAINT favorite_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(id) ON DELETE CASCADE;

ALTER TABLE public.favorite
  ADD CONSTRAINT favorite_pkey PRIMARY KEY (user_id, event_id);

GRANT ALL ON public.favorite TO anon;

GRANT ALL ON public.favorite TO authenticated;

GRANT ALL ON public.favorite TO service_role;

CREATE TABLE public.favorite_p1 PARTITION OF public.favorite FOR VALUES WITH (modulus 4, remainder 0);

GRANT ALL ON public.favorite_p1 TO anon;

GRANT ALL ON public.favorite_p1 TO authenticated;

GRANT ALL ON public.favorite_p1 TO service_role;

CREATE TABLE public.favorite_p2 PARTITION OF public.favorite FOR VALUES WITH (modulus 4, remainder 1);

GRANT ALL ON public.favorite_p2 TO anon;

GRANT ALL ON public.favorite_p2 TO authenticated;

GRANT ALL ON public.favorite_p2 TO service_role;

CREATE TABLE public.favorite_p3 PARTITION OF public.favorite FOR VALUES WITH (modulus 4, remainder 2);

GRANT ALL ON public.favorite_p3 TO anon;

GRANT ALL ON public.favorite_p3 TO authenticated;

GRANT ALL ON public.favorite_p3 TO service_role;

CREATE TABLE public.favorite_p4 PARTITION OF public.favorite FOR VALUES WITH (modulus 4, remainder 3);

GRANT ALL ON public.favorite_p4 TO anon;

GRANT ALL ON public.favorite_p4 TO authenticated;

GRANT ALL ON public.favorite_p4 TO service_role;

CREATE TABLE public.highlight (
  id             uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id        uuid                     NOT NULL,
  content        text,
  media_url      text,
  created_at     timestamp with time zone DEFAULT now() NOT NULL,
  media_type     text                     NOT NULL,
  thumbnail_url  text,
  media_duration double precision,
  group_id       uuid                     NOT NULL
);

ALTER TABLE public.highlight
  ADD CONSTRAINT highlight_media_type_check CHECK (media_type = ANY (ARRAY['image'::text, 'video'::text, 'audio'::text]));

ALTER TABLE public.highlight
  ADD CONSTRAINT highlight_media_url_check CHECK (media_url ~* '^https?://'::text);

ALTER TABLE public.highlight
  ADD CONSTRAINT highlight_pkey PRIMARY KEY (id);

GRANT ALL ON public.highlight TO anon;

GRANT ALL ON public.highlight TO authenticated;

GRANT ALL ON public.highlight TO service_role;

CREATE TABLE public.media_audit (
  public_id    text                     NOT NULL,
  action       character varying(10)    NOT NULL,
  user_id      uuid,
  performed_at timestamp with time zone DEFAULT now() NOT NULL
) PARTITION BY RANGE (performed_at);

ALTER TABLE public.media_audit
  ADD CONSTRAINT media_audit_action_check CHECK (action::text = ANY (ARRAY['upload'::character varying, 'update'::character varying, 'delete'::character varying]::text[]));

ALTER TABLE public.media_audit
  ADD CONSTRAINT media_audit_pkey PRIMARY KEY (public_id, performed_at);

GRANT ALL ON public.media_audit TO anon;

GRANT ALL ON public.media_audit TO authenticated;

GRANT ALL ON public.media_audit TO service_role;

CREATE TABLE public.payment_method (
  id          uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id     uuid                     NOT NULL,
  method_type character varying(50)    NOT NULL,
  details     jsonb,
  is_default  boolean                  DEFAULT false,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
) PARTITION BY HASH (user_id);

ALTER TABLE public.payment_method
  ADD CONSTRAINT payment_method_pkey PRIMARY KEY (id, user_id);

GRANT ALL ON public.payment_method TO anon;

GRANT ALL ON public.payment_method TO authenticated;

GRANT ALL ON public.payment_method TO service_role;

CREATE TABLE public.promo_code (
  id                  uuid                        DEFAULT gen_random_uuid() NOT NULL,
  event_id            uuid,
  promo_code          text,
  discount_percentage integer,
  expires_at          timestamp without time zone,
  max_uses            integer,
  times_used          integer                     DEFAULT 0,
  is_active           boolean                     DEFAULT true,
  created_at          timestamp without time zone DEFAULT now()
);

ALTER TABLE public.promo_code
  ADD CONSTRAINT promo_code_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(id) ON DELETE CASCADE;

ALTER TABLE public.promo_code
  ADD CONSTRAINT promo_code_pkey PRIMARY KEY (id);

ALTER TABLE public.promo_code
  ADD CONSTRAINT promo_code_promo_code_key UNIQUE (promo_code);

GRANT ALL ON public.promo_code TO anon;

GRANT ALL ON public.promo_code TO authenticated;

GRANT ALL ON public.promo_code TO service_role;

CREATE TABLE public.promo_code_usage (
  promo_code_id uuid                        NOT NULL,
  user_id       uuid                        NOT NULL,
  event_id      uuid                        NOT NULL,
  used_at       timestamp without time zone DEFAULT now()
);

ALTER TABLE public.promo_code_usage
  ADD CONSTRAINT promo_code_usage_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(id) ON DELETE CASCADE;

ALTER TABLE public.promo_code_usage
  ADD CONSTRAINT promo_code_usage_pkey PRIMARY KEY (promo_code_id, user_id, event_id);

ALTER TABLE public.promo_code_usage
  ADD CONSTRAINT promo_code_usage_promo_code_id_fkey FOREIGN KEY (promo_code_id) REFERENCES public.promo_code(id) ON DELETE CASCADE;

GRANT ALL ON public.promo_code_usage TO anon;

GRANT ALL ON public.promo_code_usage TO authenticated;

GRANT ALL ON public.promo_code_usage TO service_role;

CREATE TABLE public.receiving_account (
  id                       uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id                  uuid                     NOT NULL,
  event_id                 uuid,
  full_name                text                     NOT NULL,
  email                    text                     NOT NULL,
  payment_option           text                     NOT NULL,
  phone                    text,
  network_service_provider text,
  bank_name                text,
  bank_branch              text,
  bank_account_number      text,
  created_at               timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.receiving_account
  ADD CONSTRAINT receiving_account_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(id) ON DELETE CASCADE;

ALTER TABLE public.receiving_account
  ADD CONSTRAINT receiving_account_payment_option_check CHECK (payment_option = ANY (ARRAY['Mobile Money'::text, 'Bank'::text]));

ALTER TABLE public.receiving_account
  ADD CONSTRAINT receiving_account_pkey PRIMARY KEY (id);

GRANT ALL ON public.receiving_account TO anon;

GRANT ALL ON public.receiving_account TO authenticated;

GRANT ALL ON public.receiving_account TO service_role;

CREATE TABLE public.review (
  id          uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  reviewer_id uuid                     NOT NULL,
  reviewed_id uuid                     NOT NULL,
  rating      smallint                 NOT NULL,
  comment     text,
  status      character varying(10)    DEFAULT 'pending'::character varying NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL,
  title       text                     NOT NULL
) PARTITION BY RANGE (created_at);

ALTER TABLE public.review
  ADD CONSTRAINT review_comment_check CHECK (length(comment) <= 500);

ALTER TABLE public.review
  ADD CONSTRAINT review_pkey PRIMARY KEY (id, created_at);

ALTER TABLE public.review
  ADD CONSTRAINT review_rating_check CHECK (rating >= 1 AND rating <= 5);

ALTER TABLE public.review
  ADD CONSTRAINT review_status_check CHECK (status::text = ANY (ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying]::text[]));

GRANT ALL ON public.review TO anon;

GRANT ALL ON public.review TO authenticated;

GRANT ALL ON public.review TO service_role;

CREATE TABLE public.review_august_2025 PARTITION OF public.review FOR VALUES FROM ('2025-08-01 00:00:00+00') TO ('2025-09-01 00:00:00+00');

GRANT ALL ON public.review_august_2025 TO anon;

GRANT ALL ON public.review_august_2025 TO authenticated;

GRANT ALL ON public.review_august_2025 TO service_role;

CREATE TABLE public.review_july_2025 PARTITION OF public.review FOR VALUES FROM ('2025-07-01 00:00:00+00') TO ('2025-08-01 00:00:00+00');

GRANT ALL ON public.review_july_2025 TO anon;

GRANT ALL ON public.review_july_2025 TO authenticated;

GRANT ALL ON public.review_july_2025 TO service_role;

CREATE TABLE public.review_june_2025 PARTITION OF public.review FOR VALUES FROM ('2025-06-01 00:00:00+00') TO ('2025-07-01 00:00:00+00');

GRANT ALL ON public.review_june_2025 TO anon;

GRANT ALL ON public.review_june_2025 TO authenticated;

GRANT ALL ON public.review_june_2025 TO service_role;

CREATE TABLE public.review_october_2025 PARTITION OF public.review FOR VALUES FROM ('2025-10-01 00:00:00+00') TO ('2025-11-01 00:00:00+00');

GRANT ALL ON public.review_october_2025 TO anon;

GRANT ALL ON public.review_october_2025 TO authenticated;

GRANT ALL ON public.review_october_2025 TO service_role;

CREATE TABLE public.review_september_2025 PARTITION OF public.review FOR VALUES FROM ('2025-09-01 00:00:00+00') TO ('2025-10-01 00:00:00+00');

GRANT ALL ON public.review_september_2025 TO anon;

GRANT ALL ON public.review_september_2025 TO authenticated;

GRANT ALL ON public.review_september_2025 TO service_role;

CREATE TABLE public.story (
  id         uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id    uuid                     NOT NULL,
  content    text                     NOT NULL,
  media_url  text                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
) PARTITION BY RANGE (created_at);

ALTER TABLE public.story
  ADD CONSTRAINT story_media_url_check CHECK (media_url ~* '^https?://'::text);

ALTER TABLE public.story
  ADD CONSTRAINT story_pkey PRIMARY KEY (id, created_at);

GRANT ALL ON public.story TO anon;

GRANT ALL ON public.story TO authenticated;

GRANT ALL ON public.story TO service_role;

CREATE TABLE public.subscription (
  id             uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id        uuid                     NOT NULL,
  plan_id        smallint                 NOT NULL,
  start_date     timestamp with time zone NOT NULL,
  end_date       timestamp with time zone NOT NULL,
  events_used    integer                  DEFAULT 0 NOT NULL,
  stories_used   integer                  DEFAULT 0 NOT NULL,
  transaction_id uuid
);

ALTER TABLE public.subscription
  ADD CONSTRAINT subscription_check CHECK (end_date > start_date);

ALTER TABLE public.subscription
  ADD CONSTRAINT subscription_pkey PRIMARY KEY (id);

ALTER TABLE public.subscription
  ADD CONSTRAINT subscription_user_id_key UNIQUE (user_id);

GRANT ALL ON public.subscription TO anon;

GRANT ALL ON public.subscription TO authenticated;

GRANT ALL ON public.subscription TO service_role;

CREATE TABLE public.subscription_checkout (
  id                     uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id                uuid,
  subscription_plan_name text,
  promo_code             text,
  discount               numeric(10,2)            DEFAULT 0,
  unit_price             numeric(10,2)            NOT NULL,
  total_price            numeric(10,2)            NOT NULL,
  status                 text                     DEFAULT 'pending'::text NOT NULL,
  created_at             timestamp with time zone DEFAULT now() NOT NULL,
  completed_at           timestamp with time zone
);

ALTER TABLE public.subscription_checkout
  ADD CONSTRAINT subscription_checkout_pkey PRIMARY KEY (id);

GRANT ALL ON public.subscription_checkout TO anon;

GRANT ALL ON public.subscription_checkout TO authenticated;

GRANT ALL ON public.subscription_checkout TO service_role;

CREATE TABLE public.subscription_plan (
  id               smallint              DEFAULT nextval('public.subscription_plan_id_seq'::regclass) NOT NULL,
  name             character varying(20) NOT NULL,
  price            numeric(8,2)          NOT NULL,
  duration         interval              NOT NULL,
  max_events       integer,
  max_stories      integer,
  highlight_delay  interval,
  retention        interval              NOT NULL,
  highlight_window interval              NOT NULL
);

ALTER SEQUENCE public.subscription_plan_id_seq OWNED BY public.subscription_plan.id;

GRANT ALL ON SEQUENCE public.subscription_plan_id_seq TO anon;

GRANT ALL ON SEQUENCE public.subscription_plan_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.subscription_plan_id_seq TO service_role;

ALTER TABLE public.subscription_plan
  ADD CONSTRAINT subscription_plan_max_events_check CHECK (max_events >= 0);

ALTER TABLE public.subscription_plan
  ADD CONSTRAINT subscription_plan_max_stories_check CHECK (max_stories >= 0);

ALTER TABLE public.subscription_plan
  ADD CONSTRAINT subscription_plan_name_key UNIQUE (name);

ALTER TABLE public.subscription_checkout
  ADD CONSTRAINT subscription_checkout_subscription_plan_name_fkey FOREIGN KEY (subscription_plan_name) REFERENCES public.subscription_plan(name) ON DELETE RESTRICT;

ALTER TABLE public.subscription_plan
  ADD CONSTRAINT subscription_plan_pkey PRIMARY KEY (id);

ALTER TABLE public.subscription
  ADD CONSTRAINT subscription_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plan(id) ON DELETE CASCADE;

ALTER TABLE public.subscription_plan
  ADD CONSTRAINT subscription_plan_price_check CHECK (price >= 0::numeric);

GRANT ALL ON public.subscription_plan TO anon;

GRANT ALL ON public.subscription_plan TO authenticated;

GRANT ALL ON public.subscription_plan TO service_role;

CREATE TABLE public.ticket (
  id             uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id        uuid                     NOT NULL,
  transaction_id uuid,
  seat_number    text,
  status         text                     DEFAULT 'active'::text NOT NULL,
  qr_public_id   text                     NOT NULL,
  qr_version     character varying(10)    NOT NULL,
  issued_at      timestamp with time zone DEFAULT now() NOT NULL,
  expires_at     timestamp with time zone NOT NULL,
  used_at        timestamp with time zone,
  metadata       jsonb                    DEFAULT '{}'::jsonb,
  created_at     timestamp with time zone DEFAULT now() NOT NULL,
  updated_at     timestamp with time zone DEFAULT now(),
  ticket_type_id uuid                     NOT NULL,
  ticket_code    text
);

ALTER TABLE public.ticket
  ADD CONSTRAINT ticket_pkey PRIMARY KEY (id);

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.ticket(id);

ALTER TABLE public.ticket
  ADD CONSTRAINT ticket_qr_public_id_check CHECK (qr_public_id ~* '^[a-z0-9_\\/-]+$'::text);

ALTER TABLE public.ticket
  ADD CONSTRAINT ticket_status_check CHECK (status = ANY (ARRAY['active'::text, 'used'::text, 'expired'::text, 'cancelled'::text]));

GRANT ALL ON public.ticket TO anon;

GRANT ALL ON public.ticket TO authenticated;

GRANT ALL ON public.ticket TO service_role;

CREATE INDEX idx_ticket_user_id ON public.ticket (user_id);

CREATE INDEX idx_ticket_status ON public.ticket (status);

CREATE INDEX idx_ticket_transaction_id ON public.ticket (transaction_id);

CREATE TABLE public.ticket_checkout (
  id                  uuid                        DEFAULT gen_random_uuid() NOT NULL,
  user_id             uuid,
  event_id            uuid,
  ticket_type_id      uuid,
  quantity            integer                     NOT NULL,
  unit_price          numeric(10,2)               NOT NULL,
  promo_code          text,
  discount            numeric(10,2)               DEFAULT 0,
  total_price         numeric(10,2)               NOT NULL,
  status              text                        DEFAULT 'pending'::text,
  created_at          timestamp without time zone DEFAULT now(),
  updated_at          timestamp without time zone DEFAULT now(),
  checkout_session_id uuid
);

ALTER TABLE public.ticket_checkout
  ADD CONSTRAINT ticket_checkout_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(id) ON DELETE CASCADE;

ALTER TABLE public.ticket_checkout
  ADD CONSTRAINT ticket_checkout_pkey PRIMARY KEY (id);

ALTER TABLE public.ticket_checkout
  ADD CONSTRAINT ticket_checkout_quantity_check CHECK (quantity > 0);

GRANT ALL ON public.ticket_checkout TO anon;

GRANT ALL ON public.ticket_checkout TO authenticated;

GRANT ALL ON public.ticket_checkout TO service_role;

CREATE TABLE public.ticket_type (
  id              uuid                        DEFAULT extensions.uuid_generate_v4() NOT NULL,
  event_id        uuid,
  type            text,
  price           numeric,
  quantity        integer,
  available_from  timestamp without time zone,
  available_until timestamp without time zone,
  currency        text,
  created_at      timestamp without time zone DEFAULT now()
);

ALTER TABLE public.ticket_type
  ADD CONSTRAINT ticket_type_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(id) ON DELETE CASCADE;

ALTER TABLE public.ticket_type
  ADD CONSTRAINT ticket_type_pkey PRIMARY KEY (id);

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_type(id);

ALTER TABLE public.ticket
  ADD CONSTRAINT ticket_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_type(id) ON DELETE CASCADE;

ALTER TABLE public.ticket_checkout
  ADD CONSTRAINT ticket_checkout_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_type(id) ON DELETE RESTRICT;

GRANT ALL ON public.ticket_type TO anon;

GRANT ALL ON public.ticket_type TO authenticated;

GRANT ALL ON public.ticket_type TO service_role;

CREATE TABLE public.transaction (
  id                       uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id                  uuid                     NOT NULL,
  full_name                text                     NOT NULL,
  email                    text                     NOT NULL,
  phone_number             text                     NOT NULL,
  reason                   text                     NOT NULL,
  amount                   numeric(15,2)            NOT NULL,
  currency                 character varying(3)     DEFAULT 'USD'::character varying NOT NULL,
  status                   text                     NOT NULL,
  payment_method           text,
  payment_gateway_response jsonb,
  flutterwave_txn_id       text                     NOT NULL,
  transaction_date         timestamp with time zone DEFAULT now() NOT NULL,
  created_at               timestamp with time zone DEFAULT now() NOT NULL,
  updated_at               timestamp with time zone DEFAULT now() NOT NULL,
  metadata                 jsonb                    DEFAULT '{}'::jsonb
);

ALTER TABLE public.transaction
  ADD CONSTRAINT transaction_flutterwave_txn_id_key UNIQUE (flutterwave_txn_id);

ALTER TABLE public.transaction
  ADD CONSTRAINT transaction_pkey PRIMARY KEY (id);

ALTER TABLE public.subscription
  ADD CONSTRAINT subscription_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transaction(id);

ALTER TABLE public.ticket
  ADD CONSTRAINT ticket_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transaction(id) ON DELETE CASCADE;

ALTER TABLE public.transaction
  ADD CONSTRAINT transaction_reason_check CHECK (reason = ANY (ARRAY['Ticket_Purchase'::text, 'Plan_Purchase'::text]));

ALTER TABLE public.transaction
  ADD CONSTRAINT transaction_status_check CHECK (status = ANY (ARRAY['successful'::text, 'pending'::text, 'failed'::text, 'refunded'::text]));

GRANT ALL ON public.transaction TO anon;

GRANT ALL ON public.transaction TO authenticated;

GRANT ALL ON public.transaction TO service_role;

CREATE TABLE public.transaction_status (
  id   smallint               DEFAULT nextval('public.transaction_status_id_seq'::regclass) NOT NULL,
  name character varying(100) NOT NULL
);

ALTER SEQUENCE public.transaction_status_id_seq OWNED BY public.transaction_status.id;

GRANT ALL ON SEQUENCE public.transaction_status_id_seq TO anon;

GRANT ALL ON SEQUENCE public.transaction_status_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.transaction_status_id_seq TO service_role;

ALTER TABLE public.transaction_status
  ADD CONSTRAINT transaction_status_name_key UNIQUE (name);

ALTER TABLE public.transaction_status
  ADD CONSTRAINT transaction_status_pkey PRIMARY KEY (id);

GRANT ALL ON public.transaction_status TO anon;

GRANT ALL ON public.transaction_status TO authenticated;

GRANT ALL ON public.transaction_status TO service_role;

CREATE TABLE public.user_image_history (
  user_id        uuid                     NOT NULL,
  public_id      text                     NOT NULL,
  version        text                     NOT NULL,
  transformation text,
  created_at     timestamp with time zone DEFAULT now() NOT NULL
) PARTITION BY HASH (user_id);

ALTER TABLE public.user_image_history
  ADD CONSTRAINT user_image_history_pkey PRIMARY KEY (user_id, VERSION);

ALTER TABLE public.user_image_history
  ADD CONSTRAINT user_image_history_public_id_check CHECK (public_id ~* '^[a-z0-9_\/-]+$'::text);

GRANT ALL ON public.user_image_history TO anon;

GRANT ALL ON public.user_image_history TO authenticated;

GRANT ALL ON public.user_image_history TO service_role;

CREATE TABLE public.user_image_history_0 PARTITION OF public.user_image_history FOR VALUES WITH (modulus 4, remainder 0);

GRANT ALL ON public.user_image_history_0 TO anon;

GRANT ALL ON public.user_image_history_0 TO authenticated;

GRANT ALL ON public.user_image_history_0 TO service_role;

CREATE TABLE public.user_image_history_1 PARTITION OF public.user_image_history FOR VALUES WITH (modulus 4, remainder 1);

GRANT ALL ON public.user_image_history_1 TO anon;

GRANT ALL ON public.user_image_history_1 TO authenticated;

GRANT ALL ON public.user_image_history_1 TO service_role;

CREATE TABLE public.user_image_history_2 PARTITION OF public.user_image_history FOR VALUES WITH (modulus 4, remainder 2);

GRANT ALL ON public.user_image_history_2 TO anon;

GRANT ALL ON public.user_image_history_2 TO authenticated;

GRANT ALL ON public.user_image_history_2 TO service_role;

CREATE TABLE public.user_image_history_3 PARTITION OF public.user_image_history FOR VALUES WITH (modulus 4, remainder 3);

GRANT ALL ON public.user_image_history_3 TO anon;

GRANT ALL ON public.user_image_history_3 TO authenticated;

GRANT ALL ON public.user_image_history_3 TO service_role;

CREATE TABLE public.user_info (
  id               uuid                     NOT NULL,
  status_id        smallint                 DEFAULT 1 NOT NULL,
  username         extensions.citext,
  full_name        text,
  avatar_public_id text,
  avatar_version   text,
  bio              text,
  updated_at       timestamp with time zone DEFAULT now() NOT NULL,
  website          text
);

ALTER TABLE public.user_info
  ADD CONSTRAINT user_info_avatar_public_id_check CHECK (avatar_public_id ~* '^[a-z0-9_\/-]{3,100}$'::text);

ALTER TABLE public.user_info
  ADD CONSTRAINT user_info_bio_check CHECK (length(bio) <= 500);

ALTER TABLE public.user_info
  ADD CONSTRAINT user_info_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_info
  ADD CONSTRAINT user_info_id_key UNIQUE (id);

ALTER TABLE public.user_info
  ADD CONSTRAINT user_info_pkey PRIMARY KEY (id);

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_info(id);

ALTER TABLE public.event
  ADD CONSTRAINT event_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.user_info(id) ON DELETE CASCADE;

ALTER TABLE public.event_share
  ADD CONSTRAINT event_share_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_info(id) ON DELETE CASCADE;

ALTER TABLE public.favorite
  ADD CONSTRAINT favorite_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_info(id) ON DELETE CASCADE;

ALTER TABLE public.highlight
  ADD CONSTRAINT highlight_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_info(id) ON DELETE CASCADE;

ALTER TABLE public.media_audit
  ADD CONSTRAINT media_audit_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_info(id);

ALTER TABLE public.payment_method
  ADD CONSTRAINT payment_method_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_info(id) ON DELETE CASCADE;

ALTER TABLE public.promo_code_usage
  ADD CONSTRAINT promo_code_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_info(id);

ALTER TABLE public.receiving_account
  ADD CONSTRAINT receiving_account_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_info(id) ON DELETE CASCADE;

ALTER TABLE public.review
  ADD CONSTRAINT review_reviewed_id_fkey FOREIGN KEY (reviewed_id) REFERENCES public.user_info(id) ON DELETE CASCADE;

ALTER TABLE public.review
  ADD CONSTRAINT review_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.user_info(id) ON DELETE CASCADE;

ALTER TABLE public.story
  ADD CONSTRAINT story_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_info(id) ON DELETE CASCADE;

ALTER TABLE public.subscription
  ADD CONSTRAINT subscription_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_info(id) ON DELETE CASCADE;

ALTER TABLE public.subscription_checkout
  ADD CONSTRAINT subscription_checkout_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_info(id) ON DELETE CASCADE;

ALTER TABLE public.ticket
  ADD CONSTRAINT ticket_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_info(id) ON DELETE CASCADE;

ALTER TABLE public.ticket_checkout
  ADD CONSTRAINT ticket_checkout_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_info(id) ON DELETE SET NULL;

ALTER TABLE public.transaction
  ADD CONSTRAINT transaction_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_info(id) ON DELETE CASCADE;

ALTER TABLE public.user_image_history
  ADD CONSTRAINT user_image_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_info(id) ON DELETE CASCADE;

ALTER TABLE public.user_info
  ADD CONSTRAINT user_info_username_check CHECK (username OPERATOR(extensions.~*) '^[a-z0-9_]{3,30}$'::extensions.citext);

ALTER TABLE public.user_info
  ADD CONSTRAINT user_info_username_key UNIQUE (username);

GRANT ALL ON public.user_info TO anon;

GRANT ALL ON public.user_info TO authenticated;

GRANT ALL ON public.user_info TO service_role;

CREATE TABLE public.user_status (
  id   smallint              DEFAULT nextval('public.user_status_id_seq'::regclass) NOT NULL,
  name character varying(20) NOT NULL
);

ALTER SEQUENCE public.user_status_id_seq OWNED BY public.user_status.id;

GRANT ALL ON SEQUENCE public.user_status_id_seq TO anon;

GRANT ALL ON SEQUENCE public.user_status_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.user_status_id_seq TO service_role;

ALTER TABLE public.user_status
  ADD CONSTRAINT user_status_name_key UNIQUE (name);

ALTER TABLE public.user_status
  ADD CONSTRAINT user_status_pkey PRIMARY KEY (id);

ALTER TABLE public.user_info
  ADD CONSTRAINT user_info_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.user_status(id) ON UPDATE CASCADE ON DELETE CASCADE;

GRANT ALL ON public.user_status TO anon;

GRANT ALL ON public.user_status TO authenticated;

GRANT ALL ON public.user_status TO service_role;

CREATE TABLE public.wallet (
  id         uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id    uuid                     NOT NULL,
  balance    numeric(15,2)            DEFAULT 0,
  currency   character varying(3)     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
) PARTITION BY HASH (user_id);

ALTER TABLE public.wallet
  ADD CONSTRAINT wallet_balance_check CHECK (balance >= 0::numeric);

ALTER TABLE public.wallet
  ADD CONSTRAINT wallet_pkey PRIMARY KEY (id, user_id);

ALTER TABLE public.wallet
  ADD CONSTRAINT wallet_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_info(id) ON DELETE CASCADE;

GRANT ALL ON public.wallet TO anon;

GRANT ALL ON public.wallet TO authenticated;

GRANT ALL ON public.wallet TO service_role;

CREATE VIEW public.user_profile_details AS SELECT ui.id AS user_id,
    ui.full_name,
    ui.username,
    ui.avatar_public_id,
    ui.avatar_version,
    ui.bio,
    count(DISTINCT e.id) AS total_posts,
    count(DISTINCT f.event_id) AS total_favorites,
    round(avg(r.rating), 1) AS average_rating
   FROM (((public.user_info ui
     LEFT JOIN public.event e ON ((e.organizer_id = ui.id)))
     LEFT JOIN public.favorite f ON ((f.user_id = ui.id)))
     LEFT JOIN public.review r ON ((r.reviewed_id = ui.id)))
  GROUP BY ui.id, ui.full_name, ui.username, ui.avatar_public_id, ui.avatar_version, ui.bio;

GRANT ALL ON public.user_profile_details TO anon;

GRANT ALL ON public.user_profile_details TO authenticated;

GRANT ALL ON public.user_profile_details TO service_role;

CREATE VIEW public.wallet_public AS SELECT wallet.id,
    wallet.user_id,
    wallet.currency,
    wallet.created_at,
    wallet.updated_at
   FROM public.wallet;

GRANT ALL ON public.wallet_public TO anon;

GRANT ALL ON public.wallet_public TO authenticated;

GRANT ALL ON public.wallet_public TO service_role;
