-- Root cause being fixed: ticket_checkout rows already carry expires_at
-- (added by add_checkout_state_machine), but nothing ever reclaimed a
-- reservation once it expired unless the SAME user happened to retry
-- checkout for the SAME event (validateCheckout) or resume the SAME
-- checkout session (generateTicket). A user who simply abandons checkout
-- and never returns left ticket_type.quantity permanently decremented.
--
-- This function atomically claims every pending, past-due checkout row
-- and restores what it was holding (ticket_type.quantity, promo_code
-- usage) in a single statement. Because "claim" (flipping status from
-- 'pending' to 'expired') and "release" happen in one multi-CTE
-- statement, only the rows THIS invocation actually transitions get
-- restocked — a second, concurrent invocation (e.g. the scheduled job
-- below firing at the same moment the app's own self-heal call runs)
-- will find those rows no longer 'pending' and simply match zero rows,
-- so a reservation can never be released twice.
--
-- A 1-minute grace period past expires_at (rather than expiring the
-- instant the deadline passes) leaves headroom for a request that is
-- still actively inside generateTicket() right as its checkout's TTL
-- elapses, since that function does its work (QR generation, Cloudinary
-- upload, ticket insert) across the same row before marking it 'paid'.
CREATE FUNCTION public.expire_stale_ticket_checkouts()
RETURNS SETOF public.ticket_checkout
LANGUAGE sql
SET search_path = ''
AS $$
  WITH claimed AS (
    UPDATE public.ticket_checkout
    SET status = 'expired'
    WHERE status = 'pending'
      AND expires_at IS NOT NULL
      AND expires_at < now() - interval '1 minute'
    RETURNING *
  ),
  restock AS (
    UPDATE public.ticket_type tt
    SET quantity = tt.quantity + sums.total_quantity
    FROM (
      SELECT ticket_type_id, SUM(quantity) AS total_quantity
      FROM claimed
      GROUP BY ticket_type_id
    ) sums
    WHERE tt.id = sums.ticket_type_id
      AND tt.quantity IS NOT NULL
    RETURNING tt.id
  ),
  promo_restore AS (
    UPDATE public.promo_code pc
    SET times_used = GREATEST(0, pc.times_used - sums.total_discounted)
    FROM (
      SELECT promo_code, SUM(discounted_units) AS total_discounted
      FROM claimed
      WHERE promo_code IS NOT NULL AND discounted_units > 0
      GROUP BY promo_code
    ) sums
    WHERE pc.promo_code = sums.promo_code
    RETURNING pc.id
  ),
  usage_delete AS (
    DELETE FROM public.promo_code_usage pcu
    USING claimed c
    JOIN public.promo_code pc ON pc.promo_code = c.promo_code
    WHERE c.promo_code IS NOT NULL
      AND c.discounted_units > 0
      AND pcu.promo_code_id = pc.id
      AND pcu.user_id = c.user_id
      AND pcu.event_id = c.event_id
    RETURNING pcu.promo_code_id
  )
  SELECT * FROM claimed;
$$;

-- Deliberately narrower than this project's usual "grant to anon too"
-- convention for RPCs: only signed-in checkout flows and the cron job
-- itself ever need this, and it mutates paid-adjacent inventory/promo
-- state, so anon is intentionally left out.
GRANT ALL ON FUNCTION public.expire_stale_ticket_checkouts() TO authenticated;
GRANT ALL ON FUNCTION public.expire_stale_ticket_checkouts() TO service_role;

-- pg_cron is already installed and already used by this project (see the
-- existing "REFRESH MATERIALIZED VIEW event_search" and
-- "delete-expired-events" jobs) — this follows the same pattern rather
-- than introducing a new background-job mechanism. cron.schedule upserts
-- by job name, so re-running this migration is safe.
SELECT cron.schedule(
  'expire-stale-ticket-checkouts',
  '*/5 * * * *',
  $$SELECT public.expire_stale_ticket_checkouts();$$
);
