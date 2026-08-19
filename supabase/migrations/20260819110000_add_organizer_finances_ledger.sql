-- Organizer Finances / Payouts: the missing financial ledger. Nothing in
-- this schema previously tracked organizer earnings as a balance — the
-- existing get_organizer_dashboard_overview / get_event_overview_analytics
-- RPCs only ever computed a read-only SUM(ticket_checkout.total_price)
-- aggregate, never net of platform fee or refunds, and never a real
-- pending/available/paid-out state machine. This migration adds:
--   1. organizer_ledger_entry — an append-only, auditable ledger. Every
--      balance-changing event (a ticket sale, a confirmed refund, a payout
--      being requested/released) is one immutable row here. Balances are
--      always COMPUTED from this table by the RPCs below, never stored
--      redundantly, so Dashboard/Finances/Event Insights can never disagree.
--   2. payout_account — organizer payout destinations (separate from the
--      buyer-facing payment_method table and from the per-event, no-default,
--      no-listing receiving_account table used by event creation).
--   3. payout — one row per withdrawal request/lifecycle.
--
-- Settlement rule (confirmed business decision, not invented): an event's
-- earnings become available 48 hours after the event's LAST occurrence ends
-- (event.status must also not be 'canceled'). Nothing in this codebase ever
-- sets event.status = 'completed' — it's a dead value in event's own CHECK
-- constraint — so settlement is computed from end-of-event time, not a
-- status flag, via the public.is_event_settled() helper below.
--
-- Security: matches this schema's existing transaction/payment_attempt
-- pattern — RLS owner-only SELECT (auth.uid() = organizer_id) on all three
-- tables. organizer_ledger_entry additionally has NO insert/update/delete
-- policy at all: every ledger row is written by a SECURITY DEFINER RPC
-- (record_organizer_earning, record_refund_adjustment,
-- request_organizer_payout), never by a direct client insert, because
-- earning/refund entries are triggered by system events (a buyer's own
-- checkout completing, the Paystack webhook) rather than the organizer's own
-- session — a normal RLS insert policy can't express that trust boundary.
-- Every function still SET search_path = '' per this schema's convention,
-- and every wrapping Server Action re-checks auth.getUser() first.

-- ---------------------------------------------------------------------
-- payout_account
-- ---------------------------------------------------------------------
CREATE TABLE public.payout_account (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id         uuid NOT NULL REFERENCES public.user_info(id) ON DELETE CASCADE,
  account_type         text NOT NULL CHECK (account_type IN ('mobile_money', 'bank')),
  account_holder_name  text NOT NULL,
  provider             text,
  account_number       text NOT NULL,
  is_default           boolean NOT NULL DEFAULT false,
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  created_at           timestamp with time zone NOT NULL DEFAULT now(),
  updated_at           timestamp with time zone NOT NULL DEFAULT now()
);

-- One default ACTIVE payout account per organizer, mirroring
-- payment_method_one_default_per_user's exact pattern.
CREATE UNIQUE INDEX payout_account_one_default_per_organizer
  ON public.payout_account (organizer_id)
  WHERE is_default = true AND status = 'active';

CREATE INDEX idx_payout_account_organizer
  ON public.payout_account (organizer_id)
  WHERE status = 'active';

ALTER TABLE public.payout_account ENABLE ROW LEVEL SECURITY;

CREATE POLICY payout_account_owner_select ON public.payout_account
  FOR SELECT USING (auth.uid() = organizer_id);
CREATE POLICY payout_account_owner_insert ON public.payout_account
  FOR INSERT WITH CHECK (auth.uid() = organizer_id);
CREATE POLICY payout_account_owner_update ON public.payout_account
  FOR UPDATE USING (auth.uid() = organizer_id) WITH CHECK (auth.uid() = organizer_id);

GRANT ALL ON public.payout_account TO anon;
GRANT ALL ON public.payout_account TO authenticated;
GRANT ALL ON public.payout_account TO service_role;

-- ---------------------------------------------------------------------
-- payout
-- ---------------------------------------------------------------------
CREATE TABLE public.payout (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id       uuid NOT NULL REFERENCES public.user_info(id) ON DELETE CASCADE,
  payout_account_id  uuid NOT NULL REFERENCES public.payout_account(id) ON DELETE RESTRICT,
  amount             numeric(12,2) NOT NULL CHECK (amount > 0),
  currency           varchar(3) NOT NULL,
  status             text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed', 'cancelled')),
  reference          text NOT NULL UNIQUE,
  failure_reason     text,
  requested_at       timestamp with time zone NOT NULL DEFAULT now(),
  processed_at       timestamp with time zone,
  created_at         timestamp with time zone NOT NULL DEFAULT now(),
  updated_at         timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_payout_organizer ON public.payout (organizer_id, requested_at DESC);

ALTER TABLE public.payout ENABLE ROW LEVEL SECURITY;

-- Deliberately SELECT-only: a payout row is only ever created by the
-- request_organizer_payout() RPC below (which re-verifies the available
-- balance server-side) and only ever transitions to completed/failed by a
-- future trusted process (Paystack Transfer confirmation or a staff tool) —
-- never by the organizer's own client-side session.
CREATE POLICY payout_owner_select ON public.payout
  FOR SELECT USING (auth.uid() = organizer_id);

GRANT SELECT ON public.payout TO anon;
GRANT SELECT ON public.payout TO authenticated;
GRANT ALL ON public.payout TO service_role;

-- ---------------------------------------------------------------------
-- organizer_ledger_entry
-- ---------------------------------------------------------------------
CREATE TABLE public.organizer_ledger_entry (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id        uuid NOT NULL REFERENCES public.user_info(id) ON DELETE CASCADE,
  event_id            uuid REFERENCES public.event(id) ON DELETE SET NULL,
  ticket_checkout_id  uuid REFERENCES public.ticket_checkout(id) ON DELETE SET NULL,
  transaction_id      uuid REFERENCES public.transaction(id) ON DELETE SET NULL,
  payout_id           uuid REFERENCES public.payout(id) ON DELETE SET NULL,
  entry_type          text NOT NULL CHECK (entry_type IN ('earning', 'refund_adjustment', 'payout_hold', 'payout_release')),
  -- Signed: earning +, refund_adjustment -, payout_hold -, payout_release +.
  amount              numeric(12,2) NOT NULL,
  -- Only populated for entry_type = 'earning' — the gross/fee split locked
  -- in at the moment the earning was recorded, so a later change to the fee
  -- rate can never rewrite history.
  gross_amount        numeric(12,2),
  fee_amount          numeric(12,2),
  currency            varchar(3) NOT NULL,
  created_at          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT organizer_ledger_entry_earning_check CHECK (
    entry_type <> 'earning' OR (event_id IS NOT NULL AND ticket_checkout_id IS NOT NULL)
  ),
  CONSTRAINT organizer_ledger_entry_refund_check CHECK (
    entry_type <> 'refund_adjustment' OR (transaction_id IS NOT NULL AND ticket_checkout_id IS NOT NULL AND event_id IS NOT NULL)
  ),
  CONSTRAINT organizer_ledger_entry_payout_check CHECK (
    entry_type NOT IN ('payout_hold', 'payout_release') OR payout_id IS NOT NULL
  )
);

-- Idempotency: exactly one 'earning' row per checkout, exactly one
-- 'refund_adjustment' row per (transaction, checkout) pair — makes
-- record_organizer_earning/record_refund_adjustment safe to call more than
-- once for the same event (webhook retries, the client-verify + webhook
-- both firing), matching finalizePaystackPayment's own idempotency approach.
CREATE UNIQUE INDEX organizer_ledger_entry_earning_once
  ON public.organizer_ledger_entry (ticket_checkout_id)
  WHERE entry_type = 'earning';

CREATE UNIQUE INDEX organizer_ledger_entry_refund_once
  ON public.organizer_ledger_entry (transaction_id, ticket_checkout_id)
  WHERE entry_type = 'refund_adjustment';

CREATE INDEX idx_organizer_ledger_entry_organizer
  ON public.organizer_ledger_entry (organizer_id, entry_type);
CREATE INDEX idx_organizer_ledger_entry_event
  ON public.organizer_ledger_entry (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_organizer_ledger_entry_payout
  ON public.organizer_ledger_entry (payout_id) WHERE payout_id IS NOT NULL;
CREATE INDEX idx_organizer_ledger_entry_created
  ON public.organizer_ledger_entry (organizer_id, created_at DESC, id DESC);

ALTER TABLE public.organizer_ledger_entry ENABLE ROW LEVEL SECURITY;

CREATE POLICY organizer_ledger_entry_owner_select ON public.organizer_ledger_entry
  FOR SELECT USING (auth.uid() = organizer_id);

GRANT SELECT ON public.organizer_ledger_entry TO anon;
GRANT SELECT ON public.organizer_ledger_entry TO authenticated;
GRANT ALL ON public.organizer_ledger_entry TO service_role;

-- ---------------------------------------------------------------------
-- is_event_settled: the single settlement-eligibility rule, reused by every
-- RPC below so "pending" vs "available" can never be computed two different
-- ways. Mirrors resolveEventEndDate's MIN/MAX event_occurrence fallback
-- shape already used elsewhere in this schema (see
-- get_organizer_dashboard_overview's occurrence_bounds CTE). Returns false
-- (never settled) if the event has no resolvable end date at all, rather
-- than NULL — pending is the safe default when we don't know.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_event_settled(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    e.status <> 'canceled'
    AND now() >= COALESCE(
      (SELECT MAX(eo.ends_at) FROM public.event_occurrence eo WHERE eo.event_id = e.id),
      e.ends_at
    ) + interval '48 hours',
    false
  )
  FROM public.event e
  WHERE e.id = p_event_id;
$$;

GRANT EXECUTE ON FUNCTION public.is_event_settled(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_event_settled(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- record_organizer_earning: called from generateTicket.ts right after a
-- ticket_checkout is flipped to 'paid' (the same moment every existing
-- gross-sales RPC treats as "money collected"). SECURITY DEFINER because
-- this can be invoked from the BUYER's own session (client-verify fast
-- path) or the webhook's service-role session — either way it must be able
-- to write a ledger row owned by the ORGANIZER, which the caller's own RLS
-- grants never would allow. The 0.02 fee rate mirrors
-- src/utils/checkoutPricing.ts's CHECKOUT_FEE_RATE constant; a Postgres
-- function can't import that TS module, so if that rate ever changes both
-- places must be updated together.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_organizer_earning(p_ticket_checkout_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_organizer_id uuid;
  v_event_id     uuid;
  v_gross        numeric(12,2);
  v_fee          numeric(12,2);
  v_currency     text;
BEGIN
  SELECT e.organizer_id, e.id, tc.total_price, COALESCE(tt.currency, 'GHS')
    INTO v_organizer_id, v_event_id, v_gross, v_currency
  FROM public.ticket_checkout tc
  JOIN public.ticket_type tt ON tt.id = tc.ticket_type_id
  JOIN public.event e ON e.id = tc.event_id
  WHERE tc.id = p_ticket_checkout_id
    AND tc.status = 'paid';

  IF v_organizer_id IS NULL THEN
    RETURN;
  END IF;

  v_fee := round(v_gross * 0.02, 2);

  INSERT INTO public.organizer_ledger_entry (
    organizer_id, event_id, ticket_checkout_id, entry_type, amount, gross_amount, fee_amount, currency
  ) VALUES (
    v_organizer_id, v_event_id, p_ticket_checkout_id, 'earning', v_gross - v_fee, v_gross, v_fee, v_currency
  )
  ON CONFLICT (ticket_checkout_id) WHERE entry_type = 'earning' DO NOTHING;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_organizer_earning(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_organizer_earning(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- record_refund_adjustment: called only once a refund is CONFIRMED
-- (transaction.status -> 'refunded' via the refund.processed webhook, never
-- at refund_pending request time — matching this codebase's existing
-- principle that a refund isn't complete just because Paystack accepted the
-- request). Attribution note: a transaction can cover several tickets, and
-- those tickets can span more than one ticket_checkout row (multiple ticket
-- types bought together) — see generateTicket.ts, which stamps every ticket
-- it issues in one call with the same transaction_id regardless of which
-- checkout row produced it. This reverses each affected checkout's earning
-- proportionally: (that checkout's original per-unit earning) x (how many
-- of THIS transaction's cancelled/refunded tickets came from it). This
-- inherits, rather than resolves, the existing ticket-to-transaction
-- attribution model already used by cancelUserTicket.ts/issueRefund.ts.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_refund_adjustment(p_transaction_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  INSERT INTO public.organizer_ledger_entry (
    organizer_id, event_id, ticket_checkout_id, transaction_id, entry_type, amount, currency
  )
  SELECT
    le.organizer_id,
    le.event_id,
    le.ticket_checkout_id,
    p_transaction_id,
    'refund_adjustment',
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
    ON le.ticket_checkout_id = tc.id AND le.entry_type = 'earning'
  ON CONFLICT (transaction_id, ticket_checkout_id) WHERE entry_type = 'refund_adjustment' DO NOTHING;
$function$;

GRANT EXECUTE ON FUNCTION public.record_refund_adjustment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_refund_adjustment(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- get_organizer_finance_overview: the one figure every surface (Finances
-- Overview, the Dashboard summary, Event Insights) reads — never
-- recomputed independently. total_earnings = pending + available BEFORE
-- payout deduction (i.e. all-time net-of-refund earnings); available_balance
-- further nets out payout holds/releases, so
-- available + pending + (amount of completed payouts) reconciles back to
-- total_earnings, per the task's required consistency check.
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
      AND le.entry_type IN ('earning', 'refund_adjustment')
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

GRANT EXECUTE ON FUNCTION public.get_organizer_finance_overview() TO authenticated;

-- ---------------------------------------------------------------------
-- get_organizer_pending_earnings: pending balance broken out by event, for
-- the Finances Overview's "Pending earnings" list — each row traceable back
-- to the event that produced it.
-- ---------------------------------------------------------------------
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
    AND le.entry_type IN ('earning', 'refund_adjustment')
    AND NOT public.is_event_settled(le.event_id)
  GROUP BY e.id, e.title, le.currency
  HAVING SUM(le.amount) <> 0
  ORDER BY SUM(le.amount) DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_organizer_pending_earnings() TO authenticated;

-- ---------------------------------------------------------------------
-- get_organizer_ledger_transactions: paginated Finances > Transactions feed.
-- One 'earning' ledger row is split into two display lines (ticket_sale +
-- platform_fee) since the task's spec shows them as separate line items;
-- everything else maps 1:1 to a ledger row. Cursor pagination mirrors
-- get_user_transaction_history's exact (created_at, id) tie-break shape.
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

GRANT EXECUTE ON FUNCTION public.get_organizer_ledger_transactions(timestamptz, uuid, int) TO authenticated;

-- ---------------------------------------------------------------------
-- request_organizer_payout: the ONLY place a payout row (and its matching
-- payout_hold ledger entry) is ever inserted. Re-verifies the payout
-- account belongs to the caller, recomputes the available balance from the
-- ledger (never trusts a client-supplied figure), and takes a transaction-
-- scoped advisory lock keyed by (organizer, currency) so two concurrent
-- requests can't both read the same available balance and both succeed —
-- the second call blocks until the first commits, then sees the reduced
-- balance. Does not call any Paystack transfer API and does not mark the
-- payout completed — see this migration's header note on payout
-- fulfillment scope.
-- ---------------------------------------------------------------------
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
      WHERE le.entry_type IN ('earning', 'refund_adjustment') AND public.is_event_settled(le.event_id)
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

GRANT EXECUTE ON FUNCTION public.request_organizer_payout(uuid, numeric, text) TO authenticated;
