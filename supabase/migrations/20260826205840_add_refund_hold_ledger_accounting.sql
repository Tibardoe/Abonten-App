-- Closes a real withdrawal-race gap in the organizer finance ledger added by
-- 20260819110000_add_organizer_finances_ledger.sql: record_refund_adjustment
-- (the only thing that ever removed a refunded ticket's earning from the
-- ledger) was only ever called from the Paystack webhook, only once a
-- refund is CONFIRMED (refund.processed). Between a refund being REQUESTED
-- (issueRefund.ts flips transaction.status successful -> refund_pending)
-- and CONFIRMED, the ledger has no idea a refund is in flight — if the
-- underlying event has already settled (is_event_settled(), 48h after it
-- ends), that money sits in available_balance and is withdrawable via
-- request_organizer_payout() during that window. Confirmed live: 8
-- transactions currently sit refund_pending and 2 are refunded, with zero
-- matching refund_adjustment ledger rows for any of them — this is not a
-- theoretical race, it's already happened.
--
-- Fix: move the deduction from "refund confirmed" to "refund
-- requested/accepted by Paystack" via two new entry types:
--   refund_hold    — negative, inserted the moment transaction.status flips
--                    successful -> refund_pending (see record_refund_hold).
--   refund_release — positive, exact mirror of a hold, inserted only if the
--                    refund attempt fails and the transaction reverts
--                    refund_pending -> successful (see record_refund_release).
-- Nothing new happens at confirmation (refund.processed) — the deduction
-- already happened at hold time, which is what prevents double-counting.
-- record_refund_adjustment and the refund_adjustment entry type are left in
-- place, untouched and now unused going forward (0 rows exist in
-- production) — not dropped, per this schema's "don't delete financial
-- history" convention.
--
-- Idempotency for the two new types comes from the guarded state
-- transition itself, not a uniqueness index: record_refund_hold only
-- inserts if its own `UPDATE transaction ... WHERE status='successful'`
-- actually matched a row (Postgres's row lock serializes concurrent
-- callers, so only one wins); record_refund_release is only invoked by the
-- webhook's existing `.eq("status","refund_pending")` guard, which already
-- discards retried webhook deliveries before the RPC is ever called.
-- Unlike earning/refund_adjustment (whose triggering events — a checkout
-- staying 'paid', a webhook retry — don't naturally self-guard), holds and
-- releases are safe under retries AND legitimately need to repeat across
-- separate retry cycles (a failed refund can be retried via
-- RetryRefundBtn.tsx, which must be able to create a second hold after the
-- first was released) — a permanent uniqueness constraint here would
-- incorrectly block that legitimate second hold.

-- ---------------------------------------------------------------------
-- entry_type / CHECK constraints
-- ---------------------------------------------------------------------
ALTER TABLE public.organizer_ledger_entry
  DROP CONSTRAINT organizer_ledger_entry_entry_type_check;
ALTER TABLE public.organizer_ledger_entry
  ADD CONSTRAINT organizer_ledger_entry_entry_type_check
  CHECK (entry_type IN (
    'earning', 'refund_adjustment', 'refund_hold', 'refund_release',
    'payout_hold', 'payout_release'
  ));

ALTER TABLE public.organizer_ledger_entry
  ADD CONSTRAINT organizer_ledger_entry_refund_hold_check CHECK (
    entry_type <> 'refund_hold'
    OR (transaction_id IS NOT NULL AND ticket_checkout_id IS NOT NULL AND event_id IS NOT NULL)
  );

ALTER TABLE public.organizer_ledger_entry
  ADD CONSTRAINT organizer_ledger_entry_refund_release_check CHECK (
    entry_type <> 'refund_release'
    OR (transaction_id IS NOT NULL AND ticket_checkout_id IS NOT NULL AND event_id IS NOT NULL)
  );

-- ---------------------------------------------------------------------
-- record_refund_hold: called from issueRefund.ts right after Paystack
-- accepts a refund request. Does the transaction.status transition AND the
-- ledger deduction atomically in one function, closing the gap where those
-- two things previously happened as separate, non-atomic steps (a status
-- update in issueRefund.ts, a ledger insert only much later from the
-- webhook). Reuses record_refund_adjustment's exact proportional
-- attribution logic (a transaction can cover several tickets across more
-- than one ticket_checkout, even more than one event/organizer for a
-- multi-checkout purchase — see that function's own comment) — this just
-- changes WHEN it fires and what it's named, not the attribution math.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_refund_hold(p_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  rec RECORD;
BEGIN
  UPDATE public.transaction
  SET status = 'refund_pending',
      refund_requested_at = COALESCE(refund_requested_at, now()),
      updated_at = now()
  WHERE id = p_transaction_id AND status = 'successful';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Lock every distinct (organizer, currency) pair this refund touches, in
  -- a stable sorted order, before inserting — serializes against
  -- request_organizer_payout's own identically-keyed advisory lock so a
  -- withdrawal and a refund hold can never race on the same balance
  -- snapshot. Sorted order avoids deadlocking against another multi-
  -- organizer refund doing the same thing concurrently.
  FOR rec IN
    SELECT DISTINCT le.organizer_id, le.currency
    FROM public.ticket t
    JOIN public.ticket_checkout tc ON tc.id = t.ticket_checkout_id
    JOIN public.organizer_ledger_entry le
      ON le.ticket_checkout_id = tc.id AND le.entry_type = 'earning'
    WHERE t.transaction_id = p_transaction_id AND t.ticket_checkout_id IS NOT NULL
    ORDER BY le.organizer_id, le.currency
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(rec.organizer_id::text || ':' || rec.currency, 0));
  END LOOP;

  INSERT INTO public.organizer_ledger_entry (
    organizer_id, event_id, ticket_checkout_id, transaction_id, entry_type, amount, currency
  )
  SELECT
    le.organizer_id,
    le.event_id,
    le.ticket_checkout_id,
    p_transaction_id,
    'refund_hold',
    -1 * round(le.amount / NULLIF(tc.quantity, 0) * refunded.units, 2),
    le.currency
  FROM (
    SELECT t.ticket_checkout_id, COUNT(*) AS units
    FROM public.ticket t
    WHERE t.transaction_id = p_transaction_id
      AND t.ticket_checkout_id IS NOT NULL
    GROUP BY t.ticket_checkout_id
  ) refunded
  JOIN public.ticket_checkout tc ON tc.id = refunded.ticket_checkout_id
  JOIN public.organizer_ledger_entry le
    ON le.ticket_checkout_id = tc.id AND le.entry_type = 'earning';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_refund_hold(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_refund_hold(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_refund_hold(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_refund_hold(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- record_refund_release: called only from the Paystack webhook's
-- refund.failed branch (transaction.status refund_pending -> successful),
-- already gated there by an `.eq("status","refund_pending")` update guard
-- so a retried webhook delivery never calls this twice for the same
-- failure. Mirrors off the transaction's OWN existing refund_hold rows
-- (rather than recomputing proportional amounts again) so the reversal is
-- always an exact match for whatever was actually held.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_refund_release(p_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT organizer_id, currency
    FROM public.organizer_ledger_entry
    WHERE transaction_id = p_transaction_id AND entry_type = 'refund_hold'
    ORDER BY organizer_id, currency
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(rec.organizer_id::text || ':' || rec.currency, 0));
  END LOOP;

  INSERT INTO public.organizer_ledger_entry (
    organizer_id, event_id, ticket_checkout_id, transaction_id, entry_type, amount, currency
  )
  SELECT organizer_id, event_id, ticket_checkout_id, transaction_id, 'refund_release', -1 * amount, currency
  FROM public.organizer_ledger_entry
  WHERE transaction_id = p_transaction_id AND entry_type = 'refund_hold';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_refund_release(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_refund_release(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_refund_release(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_refund_release(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- Extend the existing "earning-family" balance aggregations to include the
-- two new entry types. CREATE OR REPLACE keeps each function's exact
-- existing RETURNS TABLE signature (no column added/removed), so no DROP
-- is needed here (unlike the currency-column change in
-- 20260816220722_add_currency_to_event_overview_analytics_v2.sql).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_organizer_finance_overview()
RETURNS TABLE (
  currency          text,
  pending_balance   numeric,
  available_balance numeric,
  total_earnings    numeric
)
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  WITH earning_rows AS (
    SELECT
      le.currency,
      le.amount,
      public.is_event_settled(le.event_id) AS settled
    FROM public.organizer_ledger_entry le
    WHERE le.organizer_id = auth.uid()
      AND le.entry_type IN ('earning', 'refund_adjustment', 'refund_hold', 'refund_release')
  ),
  earning_totals AS (
    SELECT
      currency,
      COALESCE(SUM(amount) FILTER (WHERE NOT settled), 0) AS pending,
      COALESCE(SUM(amount) FILTER (WHERE settled), 0)     AS settled_net,
      COALESCE(SUM(amount), 0)                            AS total
    FROM earning_rows
    GROUP BY currency
  ),
  payout_totals AS (
    SELECT currency, COALESCE(SUM(amount), 0) AS net
    FROM public.organizer_ledger_entry
    WHERE organizer_id = auth.uid()
      AND entry_type IN ('payout_hold', 'payout_release')
    GROUP BY currency
  ),
  currencies AS (
    SELECT currency FROM earning_totals
    UNION
    SELECT currency FROM payout_totals
  )
  SELECT
    c.currency,
    COALESCE(et.pending, 0),
    COALESCE(et.settled_net, 0) + COALESCE(pt.net, 0),
    COALESCE(et.total, 0)
  FROM currencies c
  LEFT JOIN earning_totals et ON et.currency = c.currency
  LEFT JOIN payout_totals pt ON pt.currency = c.currency;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_organizer_pending_earnings()
RETURNS TABLE (
  event_id     uuid,
  event_title  text,
  currency     text,
  amount       numeric
)
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.title,
    le.currency,
    SUM(le.amount)
  FROM public.organizer_ledger_entry le
  JOIN public.event e ON e.id = le.event_id
  WHERE le.organizer_id = auth.uid()
    AND le.entry_type IN ('earning', 'refund_adjustment', 'refund_hold', 'refund_release')
    AND NOT public.is_event_settled(le.event_id)
  GROUP BY e.id, e.title, le.currency
  HAVING SUM(le.amount) <> 0
  ORDER BY SUM(le.amount) DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_organizer_payout(
  p_payout_account_id uuid,
  p_amount             numeric,
  p_currency           text
)
RETURNS TABLE (payout_id uuid, reference text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_organizer_id   uuid := auth.uid();
  v_available      numeric;
  v_account_owner  uuid;
  v_account_status text;
  v_payout_id      uuid;
  v_reference      text;
BEGIN
  IF v_organizer_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid payout amount';
  END IF;

  SELECT organizer_id, status INTO v_account_owner, v_account_status
  FROM public.payout_account
  WHERE id = p_payout_account_id;

  IF v_account_owner IS NULL OR v_account_owner <> v_organizer_id OR v_account_status <> 'active' THEN
    RAISE EXCEPTION 'Invalid payout account';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_organizer_id::text || ':' || p_currency, 0));

  SELECT
    COALESCE(SUM(le.amount) FILTER (
      WHERE le.entry_type IN ('earning', 'refund_adjustment', 'refund_hold', 'refund_release')
        AND public.is_event_settled(le.event_id)
    ), 0)
    + COALESCE(SUM(le.amount) FILTER (WHERE le.entry_type IN ('payout_hold', 'payout_release')), 0)
  INTO v_available
  FROM public.organizer_ledger_entry le
  WHERE le.organizer_id = v_organizer_id AND le.currency = p_currency;

  IF p_amount > v_available THEN
    RAISE EXCEPTION 'Payout amount exceeds available balance';
  END IF;

  v_reference := 'PYT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.payout (organizer_id, payout_account_id, amount, currency, reference)
  VALUES (v_organizer_id, p_payout_account_id, p_amount, p_currency, v_reference)
  RETURNING id INTO v_payout_id;

  INSERT INTO public.organizer_ledger_entry (organizer_id, payout_id, entry_type, amount, currency)
  VALUES (v_organizer_id, v_payout_id, 'payout_hold', -1 * p_amount, p_currency);

  RETURN QUERY SELECT v_payout_id, v_reference;
END;
$function$;

-- ---------------------------------------------------------------------
-- get_organizer_ledger_transactions: two new UNION ALL branches. Becomes
-- SECURITY DEFINER (it wasn't before) because displaying an accurate status
-- for a refund_hold line now requires joining to transaction.status, and
-- transaction's RLS is buyer-only (auth.uid() = user_id) — the organizer's
-- own session cannot read it directly, same trust-boundary reason every
-- other cross-user read in this migration is SECURITY DEFINER. Still
-- strictly scoped by `le.organizer_id = auth.uid()` in every branch, same
-- as before RLS is bypassed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_organizer_ledger_transactions(
  p_cursor_created_at timestamptz,
  p_cursor_id         uuid,
  p_limit             int
)
RETURNS TABLE (
  entry_id     uuid,
  line         text,
  event_id     uuid,
  event_title  text,
  amount       numeric,
  currency     text,
  status       text,
  reference    text,
  created_at   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  WITH unified AS (
    SELECT le.id, 'ticket_sale'::text, le.event_id, e.title,
           le.gross_amount, le.currency, 'successful'::text,
           le.ticket_checkout_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'earning'

    UNION ALL

    SELECT le.id, 'platform_fee'::text, le.event_id, e.title,
           -1 * le.fee_amount, le.currency, 'completed'::text,
           le.ticket_checkout_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'earning'

    UNION ALL

    SELECT le.id, 'refund'::text, le.event_id, e.title,
           le.amount, le.currency, 'processed'::text,
           le.transaction_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'refund_adjustment'

    UNION ALL

    -- Status reflects the LIVE transaction state, not a hardcoded value:
    -- a refund_hold row exists the instant a refund is requested, well
    -- before Paystack confirms it, so this must show "processing" until
    -- transaction.status actually reaches 'refunded'.
    SELECT le.id, 'refund'::text, le.event_id, e.title,
           le.amount, le.currency,
           CASE t.status WHEN 'refunded' THEN 'processed' ELSE 'processing' END,
           le.transaction_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    JOIN public.transaction t ON t.id = le.transaction_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'refund_hold'

    UNION ALL

    SELECT le.id, 'refund_release'::text, le.event_id, e.title,
           le.amount, le.currency, 'completed'::text,
           le.transaction_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'refund_release'

    UNION ALL

    SELECT le.id, 'payout'::text, le.event_id, NULL::text,
           le.amount, le.currency, p.status,
           p.reference, le.created_at
    FROM public.organizer_ledger_entry le
    JOIN public.payout p ON p.id = le.payout_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'payout_hold'

    UNION ALL

    SELECT le.id, 'payout_release'::text, le.event_id, NULL::text,
           le.amount, le.currency, p.status,
           p.reference, le.created_at
    FROM public.organizer_ledger_entry le
    JOIN public.payout p ON p.id = le.payout_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'payout_release'
  )
  SELECT * FROM unified u
  WHERE p_cursor_created_at IS NULL
     OR u.created_at < p_cursor_created_at
     OR (u.created_at = p_cursor_created_at AND u.id < p_cursor_id)
  ORDER BY u.created_at DESC, u.id DESC
  LIMIT p_limit;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_organizer_ledger_transactions(timestamptz, uuid, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_organizer_ledger_transactions(timestamptz, uuid, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_organizer_ledger_transactions(timestamptz, uuid, int) TO authenticated;

-- ---------------------------------------------------------------------
-- get_event_refund_breakdown / get_organizer_refund_breakdown: report-only,
-- SECURITY DEFINER for the same transaction-status-join reason as above.
-- Both scoped strictly to the caller's own ledger rows before ever
-- touching transaction, so no buyer-owned data beyond an aggregate amount
-- is exposed across the trust boundary.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_event_refund_breakdown(p_event_id uuid)
RETURNS TABLE (
  currency               text,
  refund_request_count   bigint,
  pending_refund_amount  numeric,
  completed_refund_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
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
    le.currency,
    COUNT(DISTINCT le.transaction_id),
    COALESCE(SUM(-1 * le.amount) FILTER (WHERE t.status = 'refund_pending'), 0),
    COALESCE(SUM(-1 * le.amount) FILTER (WHERE t.status = 'refunded'), 0)
  FROM public.organizer_ledger_entry le
  JOIN public.transaction t ON t.id = le.transaction_id
  WHERE le.event_id = p_event_id
    AND le.organizer_id = auth.uid()
    AND le.entry_type = 'refund_hold'
  GROUP BY le.currency;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_event_refund_breakdown(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_event_refund_breakdown(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_event_refund_breakdown(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_organizer_refund_breakdown()
RETURNS TABLE (
  currency               text,
  refund_request_count   bigint,
  pending_refund_amount  numeric,
  completed_refund_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    le.currency,
    COUNT(DISTINCT le.transaction_id),
    COALESCE(SUM(-1 * le.amount) FILTER (WHERE t.status = 'refund_pending'), 0),
    COALESCE(SUM(-1 * le.amount) FILTER (WHERE t.status = 'refunded'), 0)
  FROM public.organizer_ledger_entry le
  JOIN public.transaction t ON t.id = le.transaction_id
  WHERE le.organizer_id = auth.uid()
    AND le.entry_type = 'refund_hold'
  GROUP BY le.currency;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_organizer_refund_breakdown() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_organizer_refund_breakdown() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_organizer_refund_breakdown() TO authenticated;

-- ---------------------------------------------------------------------
-- One-time backfill: transactions that reached refund_pending/refunded
-- before this migration have zero ledger reflection (record_refund_adjustment
-- only ran at confirmation and, per live inspection, never actually matched
-- any row for the transactions currently in this state). Additive-only —
-- no existing row is updated or deleted — reusing the exact proportional
-- attribution logic above so historical and go-forward amounts are
-- computed identically.
-- ---------------------------------------------------------------------
INSERT INTO public.organizer_ledger_entry (
  organizer_id, event_id, ticket_checkout_id, transaction_id, entry_type, amount, currency
)
SELECT
  le.organizer_id,
  le.event_id,
  le.ticket_checkout_id,
  refunded.transaction_id,
  'refund_hold',
  -1 * round(le.amount / NULLIF(tc.quantity, 0) * refunded.units, 2),
  le.currency
FROM (
  SELECT t.transaction_id, t.ticket_checkout_id, COUNT(*) AS units
  FROM public.ticket t
  JOIN public.transaction tx ON tx.id = t.transaction_id
  WHERE tx.status IN ('refund_pending', 'refunded')
    AND t.ticket_checkout_id IS NOT NULL
  GROUP BY t.transaction_id, t.ticket_checkout_id
) refunded
JOIN public.ticket_checkout tc ON tc.id = refunded.ticket_checkout_id
JOIN public.organizer_ledger_entry le
  ON le.ticket_checkout_id = tc.id AND le.entry_type = 'earning'
WHERE NOT EXISTS (
  SELECT 1 FROM public.organizer_ledger_entry existing
  WHERE existing.transaction_id = refunded.transaction_id
    AND existing.ticket_checkout_id = refunded.ticket_checkout_id
    AND existing.entry_type = 'refund_hold'
);
