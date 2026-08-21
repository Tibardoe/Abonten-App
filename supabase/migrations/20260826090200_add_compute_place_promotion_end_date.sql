-- Mirrors compute_subscription_end_date exactly (same STABLE SQL function
-- shape, same "add the plan/tier's interval column to a from_date" logic) --
-- computed in the database rather than parsed/reimplemented in application
-- code, called by activatePlacePromotion.ts.
CREATE FUNCTION public.compute_place_promotion_end_date(p_tier_id smallint, p_from_date timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT p_from_date + duration FROM public.place_promotion_tier WHERE id = p_tier_id;
$function$;

GRANT ALL ON FUNCTION public.compute_place_promotion_end_date(smallint, timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.compute_place_promotion_end_date(smallint, timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.compute_place_promotion_end_date(smallint, timestamp with time zone) TO service_role;
