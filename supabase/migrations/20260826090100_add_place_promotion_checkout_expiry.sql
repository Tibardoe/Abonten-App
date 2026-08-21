-- Same expiry-sweep pattern already used for ticket_checkout and
-- subscription_checkout (see expire_stale_subscription_checkouts in
-- 20260816090000_fix_attendance_and_subscription_expiry.sql) -- a stale
-- pending place_promotion_checkout should age out the same way every other
-- checkout kind in this schema does, so activatePlacePromotion.ts can reuse
-- the identical "call the sweep, then re-query by status='pending'" idiom.
CREATE FUNCTION public.expire_stale_place_promotion_checkouts()
RETURNS SETOF public.place_promotion_checkout
LANGUAGE sql
SET search_path = ''
AS $$
  UPDATE public.place_promotion_checkout
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at < now() - interval '1 minute'
  RETURNING *;
$$;

GRANT ALL ON FUNCTION public.expire_stale_place_promotion_checkouts() TO authenticated;
GRANT ALL ON FUNCTION public.expire_stale_place_promotion_checkouts() TO service_role;

-- Same cadence as the other two expiry sweeps, same cron.schedule
-- upsert-by-name safety for re-running this migration.
SELECT cron.schedule(
  'expire-stale-place-promotion-checkouts',
  '*/5 * * * *',
  $$SELECT public.expire_stale_place_promotion_checkouts();$$
);

CREATE INDEX IF NOT EXISTS idx_place_promotion_checkout_pending_expiry
  ON public.place_promotion_checkout (status, expires_at)
  WHERE status = 'pending';
