-- User Transactions page (attendee view): indexes + aggregation RPCs for a
-- buyer's own purchase history, sourced from ticket_checkout and
-- subscription_checkout — the tables actually written to by the checkout
-- flow. The `transaction` table is never inserted into anywhere in this
-- codebase (confirmed by auditing every checkout/purchase Server Action),
-- so it is not used as a data source here; it remains untouched, reserved
-- for a future real payment-gateway integration.
--
-- Security: both functions read auth.uid() directly rather than accepting
-- a caller-supplied user id, matching the get_organizer_dashboard_overview
-- precedent (20260816230724) — there is no id to spoof. SET search_path =
-- '' per this schema's no-RLS-anywhere convention. The wrapping Server
-- Actions additionally re-check auth.getUser() first, matching this
-- codebase's defense-in-depth pattern.
--
-- Financial definitions (see PROJECT report for full rationale): a
-- "successful" transaction is status='paid' on either table. "Tickets
-- Purchased" sums ticket_checkout.quantity (units, not row count) for paid
-- rows only. "Amount Spent" sums total_price for paid rows, grouped by
-- currency — ticket money via ticket_type.currency (COALESCEd to 'GHS'),
-- subscription money always 'GHS' since subscription_plan has no currency
-- column. All filtering is by created_at (checkout-attempt time), the same
-- timestamp shown as the row's date in the UI, so list membership and
-- displayed date never disagree.

-- ---------------------------------------------------------------------
-- Composite indexes: neither table has a user_id-based index today (only
-- (event_id, status) and (status, expires_at) partial indexes exist on
-- ticket_checkout). Mirrors the idx_transaction_user_created shape already
-- used for the (unused) transaction table.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ticket_checkout_user_created
  ON public.ticket_checkout (user_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_subscription_checkout_user_created
  ON public.subscription_checkout (user_id, created_at, id);

-- ---------------------------------------------------------------------
-- get_user_transaction_summary: top-line counts + amount spent for the
-- caller's own history in a period. Counts are currency-agnostic and
-- repeat identically on every returned row (harmless — callers read them
-- once). The subscription branch of money_by_currency always emits
-- exactly one row (a bare aggregate with no GROUP BY always returns one
-- row, 0 if no matches), so the final result always has at least one
-- ('GHS', ...) row — callers never need to handle an empty result set.
-- p_start/p_end both NULL = All Time.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_transaction_summary(
  p_start timestamptz,
  p_end timestamptz
)
  RETURNS TABLE (
    currency            text,
    amount_spent        numeric,
    total_transactions  bigint,
    successful_count    bigint,
    pending_count       bigint,
    failed_count        bigint,
    tickets_purchased   bigint,
    subscriptions_count bigint
  )
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
BEGIN
  RETURN QUERY
  WITH my_tc AS (
    SELECT tc.*
    FROM public.ticket_checkout tc
    WHERE tc.user_id = auth.uid()
      AND (p_start IS NULL OR (tc.created_at AT TIME ZONE 'UTC') >= p_start)
      AND (p_end   IS NULL OR (tc.created_at AT TIME ZONE 'UTC') <= p_end)
  ),
  my_sc AS (
    SELECT sc.*
    FROM public.subscription_checkout sc
    WHERE sc.user_id = auth.uid()
      AND (p_start IS NULL OR sc.created_at >= p_start)
      AND (p_end   IS NULL OR sc.created_at <= p_end)
  ),
  counts AS (
    SELECT
      (SELECT COUNT(*) FROM my_tc) + (SELECT COUNT(*) FROM my_sc) AS total_transactions,
      (SELECT COUNT(*) FROM my_tc WHERE status = 'paid')
        + (SELECT COUNT(*) FROM my_sc WHERE status = 'paid')      AS successful_count,
      (SELECT COUNT(*) FROM my_tc WHERE status = 'pending')
        + (SELECT COUNT(*) FROM my_sc WHERE status = 'pending')   AS pending_count,
      (SELECT COUNT(*) FROM my_tc WHERE status = 'failed')
        + (SELECT COUNT(*) FROM my_sc WHERE status = 'failed')    AS failed_count,
      (SELECT COALESCE(SUM(quantity), 0) FROM my_tc WHERE status = 'paid') AS tickets_purchased,
      (SELECT COUNT(*) FROM my_sc WHERE status = 'paid')          AS subscriptions_count
  ),
  money_by_currency AS (
    SELECT COALESCE(tt.currency, 'GHS') AS currency, SUM(mtc.total_price) AS spent
    FROM my_tc mtc
    LEFT JOIN public.ticket_type tt ON tt.id = mtc.ticket_type_id
    WHERE mtc.status = 'paid'
    GROUP BY COALESCE(tt.currency, 'GHS')

    UNION ALL

    SELECT 'GHS'::text, COALESCE(SUM(msc.total_price), 0)
    FROM my_sc msc
    WHERE msc.status = 'paid'
  ),
  money_rows AS (
    SELECT money_by_currency.currency, SUM(money_by_currency.spent) AS amount_spent
    FROM money_by_currency
    GROUP BY money_by_currency.currency
  )
  SELECT mr.currency, mr.amount_spent, c.total_transactions, c.successful_count,
         c.pending_count, c.failed_count, c.tickets_purchased, c.subscriptions_count
  FROM money_rows mr
  CROSS JOIN counts c;
END;
$function$;

-- ---------------------------------------------------------------------
-- get_user_transaction_history: paginated, merged timeline across BOTH
-- checkout tables for the caller's own purchases, one common row shape.
--
-- Pagination design: a plain UNION ALL of the two per-user branches, THEN
-- a single ORDER BY/LIMIT over the merged set — NOT a "LIMIT each branch
-- before merging" pattern (used elsewhere for best-effort activity feeds).
-- Pre-limiting each branch can silently drop a row that belongs on a
-- later page whenever one branch has more rows newer than the other
-- branch's cheapest included row, which would corrupt cursor pagination.
-- Each branch is already scoped to a single user via the new
-- (user_id, created_at, id) indexes above, so this stays a cheap index
-- range scan per branch at this data volume.
--
-- Ordered by created_at (checkout-attempt time), matching the summary
-- function's date filter and the date shown per row in the UI.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_transaction_history(
  p_start              timestamptz,
  p_end                timestamptz,
  p_cursor_created_at  timestamptz,
  p_cursor_id          uuid,
  p_limit              int
)
  RETURNS TABLE (
    id           uuid,
    kind         text,
    status       text,
    created_at   timestamptz,
    completed_at timestamptz,
    amount       numeric,
    currency     text,
    title        text,
    subtitle     text,
    quantity     integer,
    reference    uuid
  )
  LANGUAGE plpgsql
  SET search_path = ''
  AS $function$
BEGIN
  RETURN QUERY
  WITH unified AS (
    SELECT
      tc.id,
      'ticket'::text AS kind,
      tc.status,
      (tc.created_at AT TIME ZONE 'UTC') AS created_at,
      tc.completed_at,
      tc.total_price AS amount,
      COALESCE(tt.currency, 'GHS') AS currency,
      e.title,
      tt.type AS subtitle,
      tc.quantity,
      COALESCE(tc.checkout_session_id, tc.id) AS reference
    FROM public.ticket_checkout tc
    LEFT JOIN public.ticket_type tt ON tt.id = tc.ticket_type_id
    LEFT JOIN public.event e ON e.id = tc.event_id
    WHERE tc.user_id = auth.uid()
      AND (p_start IS NULL OR (tc.created_at AT TIME ZONE 'UTC') >= p_start)
      AND (p_end   IS NULL OR (tc.created_at AT TIME ZONE 'UTC') <= p_end)

    UNION ALL

    SELECT
      sc.id,
      'subscription'::text,
      sc.status,
      sc.created_at,
      sc.completed_at,
      sc.total_price,
      'GHS'::text,
      sc.subscription_plan_name,
      'Subscription'::text,
      NULL::integer,
      sc.id
    FROM public.subscription_checkout sc
    WHERE sc.user_id = auth.uid()
      AND (p_start IS NULL OR sc.created_at >= p_start)
      AND (p_end   IS NULL OR sc.created_at <= p_end)
  )
  SELECT *
  FROM unified u
  WHERE p_cursor_created_at IS NULL
     OR u.created_at < p_cursor_created_at
     OR (u.created_at = p_cursor_created_at AND u.id < p_cursor_id)
  ORDER BY u.created_at DESC, u.id DESC
  LIMIT p_limit;
END;
$function$;
