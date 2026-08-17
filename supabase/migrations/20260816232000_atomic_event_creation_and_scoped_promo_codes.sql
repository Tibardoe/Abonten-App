-- Root causes fixed here (see postEvent.ts for the corresponding app-side change):
--
-- 1. postEvent.ts inserted event -> event_occurrence -> receiving_account ->
--    ticket_type -> promo_code as separate, un-transactioned calls, with the
--    event row inserted first. A later failure (most commonly the promo code
--    unique-violation below) left a fully-created event behind while the
--    user saw a plain error and resubmitted, producing a second, independent
--    event. Fixed by moving the whole insert sequence into one plpgsql
--    function: an unhandled exception anywhere inside it rolls back
--    everything the function did, since it executes inside the caller's
--    transaction.
--
-- 2. promo_code_promo_code_key was a GLOBAL unique constraint on the raw
--    code text, so two different events could never both use "SUMMER20".
--    Replaced with a uniqueness scope of (event_id, normalized code) --
--    the same code is fine across different events, rejected twice within
--    the same event. Normalization is upper(btrim(...)) so "SUMMER20" and
--    "summer20" collide within one event (case-insensitive codes).
--
-- 3. No idempotency protection existed for event creation, so a network
--    retry or a double-click that slipped past the client-side lock could
--    create two identical events. client_request_id lets create_event
--    detect a replay of the same submission and return the already-created
--    event instead of inserting again.

ALTER TABLE public.event
  ADD COLUMN client_request_id uuid;

ALTER TABLE public.event
  ADD CONSTRAINT event_client_request_id_key UNIQUE (client_request_id);

-- Safe to drop: the scoped index below is strictly less restrictive, so
-- nothing that satisfied the global constraint can violate it.
ALTER TABLE public.promo_code
  DROP CONSTRAINT promo_code_promo_code_key;

CREATE UNIQUE INDEX promo_code_event_id_normalized_code_key
  ON public.promo_code (event_id, upper(btrim(promo_code)));

CREATE FUNCTION public.create_event (
  p_client_request_id     uuid,
  p_organizer_id          uuid,
  p_title                 text,
  p_slug                  text,
  p_description           text,
  p_event_code            text,
  p_event_category        text,
  p_event_type            text[],
  p_latitude              double precision,
  p_longitude             double precision,
  p_address               jsonb,
  p_capacity              integer,
  p_website_url           text,
  p_flyer_public_id       text,
  p_flyer_version         text,
  p_starts_at             timestamp with time zone,
  p_ends_at               timestamp with time zone,
  p_require_registration  boolean,
  p_featured              boolean,
  p_specific_dates        jsonb, -- [{start, end}] or null
  p_ticket_types          jsonb, -- [{type, price, currency, quantity, available_from, available_until}] or null
  p_promo_codes           jsonb, -- [{promo_code, discount_percentage, expires_at, max_uses}] or null
  p_receiving_account     jsonb  -- {full_name, email, phone, network_service_provider, bank_name, bank_branch, bank_account_number, payment_option} or null
)
  RETURNS uuid
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_event_id uuid;
BEGIN
  -- Idempotent replay: a prior call with this exact request already
  -- succeeded (network retry / duplicate submit slipping past the client
  -- lock). Return the event it created instead of inserting again.
  SELECT id INTO v_event_id FROM event WHERE client_request_id = p_client_request_id;
  IF v_event_id IS NOT NULL THEN
    RETURN v_event_id;
  END IF;

  INSERT INTO event (
    client_request_id, organizer_id, title, slug, description, event_code,
    event_category, event_type, location, address, capacity, website_url,
    flyer_public_id, flyer_version, starts_at, ends_at, status,
    require_registration, featured, created_at
  )
  VALUES (
    p_client_request_id, p_organizer_id, p_title, p_slug, p_description, p_event_code,
    p_event_category, p_event_type,
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::extensions.geography,
    p_address, p_capacity, p_website_url,
    p_flyer_public_id, p_flyer_version, p_starts_at, p_ends_at, 'published',
    p_require_registration, COALESCE(p_featured, false), now()
  )
  ON CONFLICT (client_request_id) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    -- Lost a race to a concurrent call carrying the same request id; the
    -- winner already created (or is creating) everything below, so just
    -- hand back its id rather than inserting duplicate dependents.
    SELECT id INTO v_event_id FROM event WHERE client_request_id = p_client_request_id;
    RETURN v_event_id;
  END IF;

  IF p_specific_dates IS NOT NULL AND jsonb_array_length(p_specific_dates) > 0 THEN
    INSERT INTO event_occurrence (event_id, starts_at, ends_at)
    SELECT v_event_id, (elem->>'start')::timestamptz, (elem->>'end')::timestamptz
    FROM jsonb_array_elements(p_specific_dates) elem;
  END IF;

  IF p_receiving_account IS NOT NULL THEN
    INSERT INTO receiving_account (
      full_name, email, phone, network_service_provider, user_id, event_id,
      bank_name, bank_branch, bank_account_number, payment_option
    )
    VALUES (
      p_receiving_account->>'full_name',
      p_receiving_account->>'email',
      p_receiving_account->>'phone',
      p_receiving_account->>'network_service_provider',
      p_organizer_id,
      v_event_id,
      p_receiving_account->>'bank_name',
      p_receiving_account->>'bank_branch',
      p_receiving_account->>'bank_account_number',
      p_receiving_account->>'payment_option'
    );
  END IF;

  IF p_ticket_types IS NOT NULL AND jsonb_array_length(p_ticket_types) > 0 THEN
    INSERT INTO ticket_type (event_id, type, price, currency, quantity, available_from, available_until)
    SELECT
      v_event_id,
      elem->>'type',
      (elem->>'price')::numeric,
      elem->>'currency',
      (elem->>'quantity')::integer,
      (elem->>'available_from')::timestamp,
      (elem->>'available_until')::timestamp
    FROM jsonb_array_elements(p_ticket_types) elem;
  END IF;

  IF p_promo_codes IS NOT NULL AND jsonb_array_length(p_promo_codes) > 0 THEN
    INSERT INTO promo_code (event_id, promo_code, discount_percentage, expires_at, max_uses, is_active)
    SELECT
      v_event_id,
      upper(btrim(elem->>'promo_code')),
      (elem->>'discount_percentage')::integer,
      (elem->>'expires_at')::timestamp,
      (elem->>'max_uses')::integer,
      (elem->>'expires_at')::timestamp > now()
    FROM jsonb_array_elements(p_promo_codes) elem;
  END IF;

  RETURN v_event_id;
END;
$function$;

GRANT ALL ON FUNCTION public.create_event(
  uuid, uuid, text, text, text, text, text, text[], double precision, double precision,
  jsonb, integer, text, text, text, timestamp with time zone, timestamp with time zone,
  boolean, boolean, jsonb, jsonb, jsonb, jsonb
) TO anon;
GRANT ALL ON FUNCTION public.create_event(
  uuid, uuid, text, text, text, text, text, text[], double precision, double precision,
  jsonb, integer, text, text, text, timestamp with time zone, timestamp with time zone,
  boolean, boolean, jsonb, jsonb, jsonb, jsonb
) TO authenticated;
GRANT ALL ON FUNCTION public.create_event(
  uuid, uuid, text, text, text, text, text, text[], double precision, double precision,
  jsonb, integer, text, text, text, timestamp with time zone, timestamp with time zone,
  boolean, boolean, jsonb, jsonb, jsonb, jsonb
) TO service_role;
