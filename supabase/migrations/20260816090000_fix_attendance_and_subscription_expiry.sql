-- Root cause being fixed (1): get_filtered_events counted attendance_count as
-- COUNT(*) over ALL attendance rows for an event, with no status filter. Two
-- problems this caused:
--   a) a cancelled attendance row (status flipped to 'cancelled' by
--      cancelUserTicket, see application-code change in the same release)
--      still counted toward the sold-out threshold forever.
--   b) a single multi-ticket purchase (quantity > 1) inserts ONE attendance
--      row with number_of_tickets = N, so COUNT(*) undercounted it as 1
--      regardless of N.
-- Both are fixed by summing number_of_tickets and filtering to the
-- 'attending' status, matching the attendance table's own CHECK constraint
-- (attending/cancelled).
CREATE OR REPLACE FUNCTION public.get_filtered_events (
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
      SELECT COALESCE(SUM(a.number_of_tickets), 0) FROM attendance a
      WHERE a.event_id = e.id AND a.status = 'attending'
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

-- Root cause being fixed (2): subscription_checkout got an expires_at column
-- (see 20260815120000_add_checkout_state_machine) but, unlike ticket_checkout,
-- nothing ever reclaimed a subscription checkout once it went stale — there
-- was no equivalent of expire_stale_ticket_checkouts for this table. Mirrors
-- that function's shape (same 1-minute grace period, same claim-once
-- semantics via the UPDATE ... RETURNING), but simpler: a subscription
-- checkout doesn't hold ticket inventory or promo usage, so there is nothing
-- to restock — only the status transition itself.
CREATE FUNCTION public.expire_stale_subscription_checkouts()
RETURNS SETOF public.subscription_checkout
LANGUAGE sql
SET search_path = ''
AS $$
  UPDATE public.subscription_checkout
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at < now() - interval '1 minute'
  RETURNING *;
$$;

GRANT ALL ON FUNCTION public.expire_stale_subscription_checkouts() TO authenticated;
GRANT ALL ON FUNCTION public.expire_stale_subscription_checkouts() TO service_role;

-- Same cadence as expire-stale-ticket-checkouts, same cron.schedule
-- upsert-by-name safety for re-running this migration.
SELECT cron.schedule(
  'expire-stale-subscription-checkouts',
  '*/5 * * * *',
  $$SELECT public.expire_stale_subscription_checkouts();$$
);

-- Supporting index for the same reason idx_ticket_checkout_pending_expiry was
-- added: this sweep and every self-heal call now filter subscription_checkout
-- by status/expires_at with no supporting index.
CREATE INDEX IF NOT EXISTS idx_subscription_checkout_pending_expiry
  ON public.subscription_checkout (status, expires_at)
  WHERE status = 'pending';
