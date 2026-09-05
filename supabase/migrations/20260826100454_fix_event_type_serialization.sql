-- event.event_type is a plain `text` column (see
-- supabase/migrations/20260810084821_remote_schema.sql), but two write paths
-- disagreed on what to put in it: create_event received a text[] parameter
-- and inserted it directly, which Postgres serializes using its own native
-- array-literal syntax (e.g. `{"Live Concerts"}` -- not valid JSON), while
-- updateEvent.ts (src/actions/updateEvent.ts) writes the same conceptual
-- value through PostgREST, which sends a JS array as JSON text (e.g.
-- `["Live Concerts"]`). src/utils/parseEventTypes.ts already parses both
-- formats defensively (and documents this exact discrepancy), but the
-- inconsistency itself was never fixed at the source. This migration does
-- that:
--   1. create_event now serializes p_event_type the same way PostgREST
--      already does (JSON array text), so every future write is consistent.
--   2. Existing rows already written in the Postgres-array-literal format
--      are backfilled to the same JSON format.
-- parseEventTypes.ts's defensive Postgres-array-literal branch is left in
-- place as a harmless fallback rather than removed.
--
-- Same signature as the live definition (verified via pg_get_functiondef
-- before writing this migration) -- only the event_type value in the INSERT
-- changes, so CREATE OR REPLACE is safe here (no DROP needed).

CREATE OR REPLACE FUNCTION public.create_event(p_client_request_id uuid, p_organizer_id uuid, p_title text, p_slug text, p_description text, p_event_code text, p_event_category text, p_event_type text[], p_latitude double precision, p_longitude double precision, p_address jsonb, p_capacity integer, p_website_url text, p_flyer_public_id text, p_flyer_version text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_require_registration boolean, p_featured boolean, p_specific_dates jsonb, p_ticket_types jsonb, p_promo_codes jsonb, p_receiving_account jsonb, p_place_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
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
    require_registration, featured, place_id, created_at
  )
  VALUES (
    p_client_request_id, p_organizer_id, p_title, p_slug, p_description, p_event_code,
    p_event_category, array_to_json(p_event_type)::text,
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::extensions.geography,
    p_address, p_capacity, p_website_url,
    p_flyer_public_id, p_flyer_version, p_starts_at, p_ends_at, 'published',
    p_require_registration, COALESCE(p_featured, false), p_place_id, now()
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

-- Backfill: normalize existing rows already written in the Postgres
-- array-literal format (e.g. `{"Live Concerts"}`) to the same JSON format
-- create_event now writes and updateEvent.ts already wrote (e.g.
-- `["Live Concerts"]`). Casting to text[] relies on Postgres's own array
-- parser (safer than manually splitting on commas given quoting/escaping
-- rules) -- this only succeeds because these particular rows were
-- themselves originally produced by Postgres's own array-to-text
-- serialization of the bug being fixed above. Verified via a preview SELECT
-- against all 4 affected rows before running, matching this exact
-- transformation, before this migration was written.
UPDATE event
SET event_type = array_to_json(event_type::text[])::text
WHERE event_type LIKE '{%}';

-- Cleanup: drop the stale, orphaned 11-parameter get_filtered_events
-- overload left behind by an earlier migration that used CREATE OR REPLACE
-- instead of DROP + CREATE when the signature changed (cursor pagination
-- params were added). The 15-parameter version (see
-- 20260902130000_multi_type_event_filter.sql) is the only one any caller
-- actually uses -- this stale one was never called by the app.
DROP FUNCTION IF EXISTS public.get_filtered_events(
  numeric, numeric, timestamp with time zone, timestamp with time zone,
  double precision, double precision, double precision, text, text, text,
  numeric
);
