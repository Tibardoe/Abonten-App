-- Mirrors expire_stale_place_promotion_checkouts exactly (see
-- 20260826090100_add_place_promotion_checkout_expiry.sql) -- a stale pending
-- event_promotion_checkout should age out the same way every other checkout
-- kind in this schema does, so activateEventPromotion.ts can reuse the
-- identical "call the sweep, then re-query by status='pending'" idiom.
CREATE FUNCTION public.expire_stale_event_promotion_checkouts()
RETURNS SETOF public.event_promotion_checkout
LANGUAGE sql
SET search_path = ''
AS $$
  UPDATE public.event_promotion_checkout
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at < now() - interval '1 minute'
  RETURNING *;
$$;

GRANT ALL ON FUNCTION public.expire_stale_event_promotion_checkouts() TO authenticated;
GRANT ALL ON FUNCTION public.expire_stale_event_promotion_checkouts() TO service_role;

SELECT cron.schedule(
  'expire-stale-event-promotion-checkouts',
  '*/5 * * * *',
  $$SELECT public.expire_stale_event_promotion_checkouts();$$
);

CREATE INDEX IF NOT EXISTS idx_event_promotion_checkout_pending_expiry
  ON public.event_promotion_checkout (status, expires_at)
  WHERE status = 'pending';
