-- CRITICAL FIX: security_cleanup_batch6 pinned search_path on 17 functions
-- using `SET search_path = 'public, extensions'` -- a single-quoted STRING.
-- Postgres treats that as ONE schema literally named "public, extensions"
-- (comma and all), not two schemas. Every one of these functions has been
-- unable to resolve any unqualified table/type since that migration ran --
-- confirmed by reproducing create_event() directly, which failed with
-- `relation "event" does not exist`. This explains the user-reported
-- "no events/places in listings" and "error creating an event" — every
-- affected RPC (event/place search, event/place creation, place claim
-- approval, promotions, search suggestions) was broken by the same typo.
--
-- Correct syntax: SET search_path TO schema1, schema2 (unquoted,
-- comma-separated identifier list) -- confirmed against a fresh
-- create_event() call after this fix, which now succeeds.

ALTER FUNCTION public.create_user_info_if_not_exists() SET search_path TO public, extensions;
ALTER FUNCTION public.log_user_changes() SET search_path TO public, extensions;
ALTER FUNCTION public.get_nearby_events(double precision, double precision, double precision) SET search_path TO public, extensions;
ALTER FUNCTION public.get_nearby_events(double precision, double precision, double precision, timestamp with time zone, uuid, integer) SET search_path TO public, extensions;
ALTER FUNCTION public.get_filtered_events(numeric, numeric, timestamp with time zone, timestamp with time zone, double precision, double precision, double precision, text, text, text, numeric, timestamp with time zone, double precision, uuid, integer) SET search_path TO public, extensions;
ALTER FUNCTION public.get_filtered_events(numeric, numeric, timestamp with time zone, timestamp with time zone, double precision, double precision, double precision, text, text, text, numeric) SET search_path TO public, extensions;
ALTER FUNCTION public.get_events_in_window(double precision, double precision, double precision, timestamp with time zone, timestamp with time zone, timestamp with time zone, uuid, integer) SET search_path TO public, extensions;
ALTER FUNCTION public.create_place(uuid, uuid, text, text, text, smallint, double precision, double precision, jsonb, text, text, text, jsonb, text, text, jsonb, jsonb) SET search_path TO public, extensions;
ALTER FUNCTION public.place_is_open_now(uuid, timestamp with time zone) SET search_path TO public, extensions;
ALTER FUNCTION public.get_nearby_places(double precision, double precision, double precision, double precision, uuid, integer) SET search_path TO public, extensions;
ALTER FUNCTION public.get_filtered_places(text, smallint, numeric, boolean, double precision, double precision, double precision, double precision, uuid, integer) SET search_path TO public, extensions;
ALTER FUNCTION public.create_event(uuid, uuid, text, text, text, text, text, text[], double precision, double precision, jsonb, integer, text, text, text, timestamp with time zone, timestamp with time zone, boolean, boolean, jsonb, jsonb, jsonb, jsonb, uuid) SET search_path TO public, extensions;
ALTER FUNCTION public.approve_place_claim(uuid, uuid) SET search_path TO public, extensions;
ALTER FUNCTION public.get_active_place_promotions(double precision, double precision, double precision, integer) SET search_path TO public, extensions;
ALTER FUNCTION public.get_similar_events(text, extensions.geography, numeric) SET search_path TO public, extensions;
ALTER FUNCTION public.get_event_suggestions(text, integer) SET search_path TO public, extensions;
ALTER FUNCTION public.get_place_suggestions(text, integer) SET search_path TO public, extensions;
