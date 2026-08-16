-- Manage Attendance analytics dashboard support.
--
-- Part 1: links a purchase (ticket_checkout row) and an issued ticket to the
-- specific event_occurrence it was bought for, so multi-date ("specific
-- dates") events can report sales/attendance per date. Nullable and stays
-- nullable permanently: single-date/range events never populate
-- event_occurrence at all (see postEvent.ts), and even for multi-date
-- events, every row inserted before this migration predates the column —
-- analytics code must bucket NULL as "date not recorded", not treat it as
-- an error.
--
-- Part 2: composite indexes supporting the new event-analytics RPCs below
-- (event-scoped aggregate filters on ticket_checkout/ticket, and the
-- returning-attendee lookup on attendance by user_id). No new index is
-- added on event(organizer_id) — idx_event_organizer_created(organizer_id,
-- created_at, id), added in 20260816160000_add_phase3_4_pagination_indexes,
-- already covers equality lookups on that column as its leading key.
--
-- Part 3: the RPCs themselves. None of them are exposed to buyers — every
-- one is an organizer-only aggregate over their own event, and since this
-- schema has no RLS anywhere (every table is blanket-GRANTed to
-- `authenticated`), a function callable via PostgREST must defend itself:
-- each does an early, explicit `auth.uid() = event.organizer_id` check and
-- returns an empty result set otherwise. This is a new pattern in this
-- migration history (existing RPCs are either public-read event discovery
-- or system/cron maintenance, none gate on the caller's identity), needed
-- because these functions return financial and attendee data. The calling
-- Server Actions (src/actions/) additionally re-check ownership before
-- invoking these, matching this codebase's existing defense-in-depth
-- convention (every Server Action re-checks auth.getUser() even though
-- src/proxy.ts already gates the route).

ALTER TABLE public.ticket_checkout
  ADD COLUMN occurrence_id uuid;

ALTER TABLE public.ticket_checkout
  ADD CONSTRAINT ticket_checkout_occurrence_id_fkey
  FOREIGN KEY (occurrence_id) REFERENCES public.event_occurrence(id) ON DELETE SET NULL;

ALTER TABLE public.ticket
  ADD COLUMN occurrence_id uuid;

ALTER TABLE public.ticket
  ADD CONSTRAINT ticket_occurrence_id_fkey
  FOREIGN KEY (occurrence_id) REFERENCES public.event_occurrence(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_checkout_occurrence_id
  ON public.ticket_checkout (occurrence_id);

CREATE INDEX IF NOT EXISTS idx_ticket_occurrence_id
  ON public.ticket (occurrence_id);

CREATE INDEX IF NOT EXISTS idx_ticket_checkout_event_status
  ON public.ticket_checkout (event_id, status);

CREATE INDEX IF NOT EXISTS idx_ticket_ticket_type_status
  ON public.ticket (ticket_type_id, status);

CREATE INDEX IF NOT EXISTS idx_attendance_user_status
  ON public.attendance (user_id, status);

-- ---------------------------------------------------------------------
-- get_event_overview_analytics: top-line KPIs for one event, single row.
-- capacity_remaining is informational only — event.capacity is never
-- actually enforced at purchase time (only ticket_type.quantity gates
-- checkout, via reserveTicketQuantity/releaseTicketQuantity), so the
-- authoritative "remaining" figure per ticket type lives in
-- get_event_ticket_type_analytics instead.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_event_overview_analytics(p_event_id uuid)
  RETURNS TABLE (
    event_title           text,
    starts_at             timestamp with time zone,
    ends_at               timestamp with time zone,
    require_registration  boolean,
    capacity               integer,
    tickets_sold           bigint,
    tickets_cancelled      bigint,
    gross_sales             numeric,
    total_discount          numeric,
    promo_purchase_count    bigint,
    distinct_attendees      bigint,
    capacity_remaining      integer
  )
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.event e
    WHERE e.id = p_event_id AND e.organizer_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH ticket_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE t.status = 'active')    AS sold,
      COUNT(*) FILTER (WHERE t.status = 'cancelled') AS cancelled
    FROM public.ticket t
    JOIN public.ticket_type tt ON tt.id = t.ticket_type_id
    WHERE tt.event_id = p_event_id
  ),
  checkout_totals AS (
    SELECT
      COALESCE(SUM(tc.total_price), 0)                                 AS gross,
      COALESCE(SUM(tc.discount), 0)                                    AS discount,
      COUNT(*) FILTER (WHERE tc.promo_code IS NOT NULL)                AS promo_orders
    FROM public.ticket_checkout tc
    WHERE tc.event_id = p_event_id AND tc.status = 'paid'
  ),
  attendee_count AS (
    SELECT COUNT(DISTINCT a.user_id) AS distinct_users
    FROM public.attendance a
    WHERE a.event_id = p_event_id AND a.status = 'attending'
  )
  SELECT
    e.title,
    e.starts_at,
    e.ends_at,
    e.require_registration,
    e.capacity,
    ticket_counts.sold,
    ticket_counts.cancelled,
    checkout_totals.gross,
    checkout_totals.discount,
    checkout_totals.promo_orders,
    attendee_count.distinct_users,
    CASE WHEN e.capacity IS NOT NULL THEN e.capacity - ticket_counts.sold::integer ELSE NULL END
  FROM public.event e
  CROSS JOIN ticket_counts
  CROSS JOIN checkout_totals
  CROSS JOIN attendee_count
  WHERE e.id = p_event_id;
END;
$function$;

-- ---------------------------------------------------------------------
-- get_event_ticket_type_analytics: one row per ticket_type, using the
-- organizer's own type names (no hardcoded "VIP"/"Standard" etc).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_event_ticket_type_analytics(p_event_id uuid)
  RETURNS TABLE (
    ticket_type_id    uuid,
    type               text,
    price              numeric,
    currency           text,
    quantity_capacity  integer,
    sold               bigint,
    cancelled          bigint,
    percent_sold       numeric,
    revenue            numeric,
    discount           numeric
  )
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.event e
    WHERE e.id = p_event_id AND e.organizer_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH sold_counts AS (
    SELECT
      t.ticket_type_id,
      COUNT(*) FILTER (WHERE t.status = 'active')    AS sold,
      COUNT(*) FILTER (WHERE t.status = 'cancelled') AS cancelled
    FROM public.ticket t
    WHERE t.ticket_type_id IN (SELECT id FROM public.ticket_type WHERE event_id = p_event_id)
    GROUP BY t.ticket_type_id
  ),
  revenue_totals AS (
    SELECT
      tc.ticket_type_id,
      COALESCE(SUM(tc.total_price), 0) AS revenue,
      COALESCE(SUM(tc.discount), 0)    AS discount
    FROM public.ticket_checkout tc
    WHERE tc.event_id = p_event_id AND tc.status = 'paid'
    GROUP BY tc.ticket_type_id
  )
  SELECT
    tt.id,
    tt.type,
    tt.price,
    tt.currency,
    tt.quantity,
    COALESCE(sold_counts.sold, 0),
    COALESCE(sold_counts.cancelled, 0),
    CASE WHEN tt.quantity IS NOT NULL AND tt.quantity > 0
      THEN ROUND(100.0 * COALESCE(sold_counts.sold, 0) / tt.quantity, 1)
      ELSE NULL
    END,
    COALESCE(revenue_totals.revenue, 0),
    COALESCE(revenue_totals.discount, 0)
  FROM public.ticket_type tt
  LEFT JOIN sold_counts ON sold_counts.ticket_type_id = tt.id
  LEFT JOIN revenue_totals ON revenue_totals.ticket_type_id = tt.id
  WHERE tt.event_id = p_event_id
  ORDER BY tt.created_at;
END;
$function$;

-- ---------------------------------------------------------------------
-- get_event_promo_analytics: grouped by ticket_checkout.promo_code (free
-- text). promo_code_usage is NOT used here — its primary key is
-- (promo_code_id, user_id, event_id), one row per user per event, so it
-- can't represent multiple orders by the same user and isn't suitable for
-- an order-level breakdown.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_event_promo_analytics(p_event_id uuid)
  RETURNS TABLE (
    promo_code        text,
    orders             bigint,
    units_discounted   bigint,
    total_discount     numeric,
    total_revenue      numeric
  )
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.event e
    WHERE e.id = p_event_id AND e.organizer_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    tc.promo_code,
    COUNT(*),
    COALESCE(SUM(tc.discounted_units), 0),
    COALESCE(SUM(tc.discount), 0),
    COALESCE(SUM(tc.total_price), 0)
  FROM public.ticket_checkout tc
  WHERE tc.event_id = p_event_id
    AND tc.status = 'paid'
    AND tc.promo_code IS NOT NULL
  GROUP BY tc.promo_code
  ORDER BY COALESCE(SUM(tc.discount), 0) DESC;
END;
$function$;

-- ---------------------------------------------------------------------
-- get_event_date_analytics: one row per event_occurrence, plus (only when
-- non-empty) one NULL-occurrence row bucketing tickets/checkouts that
-- predate this migration's occurrence_id column. Callers should only
-- invoke this for events that actually have event_occurrence rows — see
-- getEventDateAnalytics.ts, which checks that first to avoid a wasted
-- round trip for the common single-date event case.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_event_date_analytics(p_event_id uuid)
  RETURNS TABLE (
    occurrence_id      uuid,
    starts_at           timestamp with time zone,
    ends_at             timestamp with time zone,
    tickets_sold        bigint,
    tickets_cancelled   bigint,
    revenue             numeric
  )
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.event e
    WHERE e.id = p_event_id AND e.organizer_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH ticket_counts AS (
    SELECT
      t.occurrence_id,
      COUNT(*) FILTER (WHERE t.status = 'active')    AS sold,
      COUNT(*) FILTER (WHERE t.status = 'cancelled') AS cancelled
    FROM public.ticket t
    JOIN public.ticket_type tt ON tt.id = t.ticket_type_id
    WHERE tt.event_id = p_event_id
    GROUP BY t.occurrence_id
  ),
  revenue_totals AS (
    SELECT
      tc.occurrence_id,
      COALESCE(SUM(tc.total_price), 0) AS revenue
    FROM public.ticket_checkout tc
    WHERE tc.event_id = p_event_id AND tc.status = 'paid'
    GROUP BY tc.occurrence_id
  )
  SELECT
    eo.id,
    eo.starts_at,
    eo.ends_at,
    COALESCE(ticket_counts.sold, 0),
    COALESCE(ticket_counts.cancelled, 0),
    COALESCE(revenue_totals.revenue, 0)
  FROM public.event_occurrence eo
  LEFT JOIN ticket_counts ON ticket_counts.occurrence_id = eo.id
  LEFT JOIN revenue_totals ON revenue_totals.occurrence_id = eo.id
  WHERE eo.event_id = p_event_id

  UNION ALL

  SELECT
    NULL::uuid,
    NULL::timestamp with time zone,
    NULL::timestamp with time zone,
    COALESCE(ticket_counts.sold, 0),
    COALESCE(ticket_counts.cancelled, 0),
    COALESCE(revenue_totals.revenue, 0)
  FROM ticket_counts
  FULL JOIN revenue_totals ON revenue_totals.occurrence_id = ticket_counts.occurrence_id
  WHERE COALESCE(ticket_counts.occurrence_id, revenue_totals.occurrence_id) IS NULL
    AND (COALESCE(ticket_counts.sold, 0) > 0
      OR COALESCE(ticket_counts.cancelled, 0) > 0
      OR COALESCE(revenue_totals.revenue, 0) > 0)

  ORDER BY starts_at NULLS LAST;
END;
$function$;

-- ---------------------------------------------------------------------
-- get_event_returning_attendee_stats: single batched, set-based query
-- (no per-attendee loop). A "returning" attendee is someone in this
-- event's current active attendee set who also has an active attendance
-- record for at least one OTHER event by the same organizer.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_event_returning_attendee_stats(p_event_id uuid)
  RETURNS TABLE (
    returning_count    bigint,
    first_time_count   bigint
  )
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
DECLARE
  v_organizer_id uuid;
BEGIN
  SELECT e.organizer_id INTO v_organizer_id
  FROM public.event e
  WHERE e.id = p_event_id AND e.organizer_id = auth.uid();

  IF v_organizer_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH current_attendees AS (
    SELECT DISTINCT a.user_id
    FROM public.attendance a
    WHERE a.event_id = p_event_id AND a.status = 'attending'
  ),
  returning_attendees AS (
    SELECT ca.user_id
    FROM current_attendees ca
    WHERE EXISTS (
      SELECT 1
      FROM public.attendance a2
      JOIN public.event e2 ON e2.id = a2.event_id
      WHERE a2.user_id = ca.user_id
        AND a2.event_id <> p_event_id
        AND a2.status = 'attending'
        AND e2.organizer_id = v_organizer_id
    )
  )
  SELECT
    (SELECT COUNT(*) FROM returning_attendees),
    (SELECT COUNT(*) FROM current_attendees) - (SELECT COUNT(*) FROM returning_attendees);
END;
$function$;

-- ---------------------------------------------------------------------
-- get_event_sales_timeline: paid checkouts grouped by completion day.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_event_sales_timeline(p_event_id uuid)
  RETURNS TABLE (
    sale_date   date,
    gross        numeric,
    orders       bigint
  )
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.event e
    WHERE e.id = p_event_id AND e.organizer_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    DATE(COALESCE(tc.completed_at, tc.created_at)) AS sale_date,
    COALESCE(SUM(tc.total_price), 0),
    COUNT(*)
  FROM public.ticket_checkout tc
  WHERE tc.event_id = p_event_id AND tc.status = 'paid'
  GROUP BY DATE(COALESCE(tc.completed_at, tc.created_at))
  ORDER BY sale_date;
END;
$function$;
