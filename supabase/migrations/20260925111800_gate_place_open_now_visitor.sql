-- Production gate 2026-09-25: place_is_open_now failed for a signed-out
-- visitor with "permission denied for function default_market_timezone".
--
-- The function is SECURITY INVOKER and granted to anon, but its zone
-- fallback called default_market_timezone(), which anon may not execute.
-- Postgres checks EXECUTE when it prepares the expression, not when the
-- COALESCE reaches that argument, so every visitor call failed although
-- place.timezone is NOT NULL and the fallback never answers. The in-database
-- callers (get_nearby_places, get_filtered_places, search_places,
-- get_active_place_promotions) are SECURITY DEFINER and were unaffected; no
-- app calls the function directly. The dead fallback is removed; no grant
-- changes. Reproduced in session-rpc-reachability.integration.test.ts.

CREATE OR REPLACE FUNCTION public.place_is_open_now(p_place_id uuid, p_now timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_temporary_status text;
  v_zone text;
  v_local timestamp;
  v_dow smallint;
  v_time time;
  v_is_open boolean;
BEGIN
  SELECT temporary_status, timezone INTO v_temporary_status, v_zone FROM place WHERE id = p_place_id;
  IF v_temporary_status IS NOT NULL THEN
    RETURN false;
  END IF;

  v_local := p_now AT TIME ZONE coalesce(nullif(v_zone, ''), 'UTC');
  v_dow := EXTRACT(DOW FROM v_local);
  v_time := v_local::time;

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
