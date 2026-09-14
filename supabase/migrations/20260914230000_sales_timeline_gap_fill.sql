-- The organizer's "Sales over time" chart drew a false picture.
--
-- get_organizer_sales_timeline() grouped paid checkouts by bucket and
-- returned only the buckets that HAD sales. The dashboard plots the rows it
-- gets in order, evenly spaced, so a 30-day period with sales on seven
-- scattered days rendered as seven adjacent bars: a quiet fortnight and a
-- busy one looked the same, the gaps between sales vanished, and the axis
-- labels sat under bars that were not at those dates on any real time axis.
-- For a chart an organizer uses to judge how a run of promotion is going,
-- that is a misreading rather than a cosmetic issue.
--
-- The aggregate now runs against a generated series of every bucket in the
-- requested window, so a day with no sales comes back as a real zero and the
-- x-axis is linear. Callers get more rows and the same shape; `gross` and
-- `orders` are unchanged for every bucket that had data.
--
-- When either bound is NULL the period is open-ended ("All time", where
-- getDashboardPeriodRange returns start = null), and there is no range to
-- generate over — that case keeps the original sparse behaviour.

create or replace function public.get_organizer_sales_timeline(p_start timestamp with time zone, p_end timestamp with time zone, p_bucket text)
 RETURNS TABLE(bucket_start timestamp with time zone, gross numeric, orders bigint)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF p_bucket NOT IN ('hour', 'day', 'month') THEN
    RAISE EXCEPTION 'invalid bucket: %', p_bucket;
  END IF;

  -- Open-ended window: nothing to generate a series between, so return only
  -- the buckets that have data (the original behaviour).
  IF p_start IS NULL OR p_end IS NULL THEN
    RETURN QUERY
    SELECT
      date_trunc(p_bucket, COALESCE(tc.completed_at, tc.created_at)) AS bucket_start,
      COALESCE(SUM(tc.total_price), 0),
      COUNT(*)
    FROM public.ticket_checkout tc
    JOIN public.event e ON e.id = tc.event_id
    WHERE e.organizer_id = auth.uid()
      AND e.status = 'published'
      AND tc.status = 'paid'
      AND (p_start IS NULL OR COALESCE(tc.completed_at, tc.created_at) >= p_start)
      AND (p_end IS NULL OR COALESCE(tc.completed_at, tc.created_at) <= p_end)
    GROUP BY date_trunc(p_bucket, COALESCE(tc.completed_at, tc.created_at))
    ORDER BY bucket_start;

    RETURN;
  END IF;

  RETURN QUERY
  WITH buckets AS (
    SELECT generate_series(
      date_trunc(p_bucket, p_start),
      date_trunc(p_bucket, p_end),
      ('1 ' || p_bucket)::interval
    ) AS bucket_start
  ),
  sales AS (
    SELECT
      date_trunc(p_bucket, COALESCE(tc.completed_at, tc.created_at)) AS bucket_start,
      COALESCE(SUM(tc.total_price), 0) AS gross,
      COUNT(*) AS orders
    FROM public.ticket_checkout tc
    JOIN public.event e ON e.id = tc.event_id
    WHERE e.organizer_id = auth.uid()
      AND e.status = 'published'
      AND tc.status = 'paid'
      AND COALESCE(tc.completed_at, tc.created_at) >= p_start
      AND COALESCE(tc.completed_at, tc.created_at) <= p_end
    GROUP BY date_trunc(p_bucket, COALESCE(tc.completed_at, tc.created_at))
  )
  SELECT
    b.bucket_start,
    COALESCE(s.gross, 0)::numeric,
    COALESCE(s.orders, 0)::bigint
  FROM buckets b
  LEFT JOIN sales s ON s.bucket_start = b.bucket_start
  ORDER BY b.bucket_start;
END;
$function$;
