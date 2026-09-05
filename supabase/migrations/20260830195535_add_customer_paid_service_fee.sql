-- Customer-paid service fee model (2026-08-30).
--
-- Before this migration the fee model was contradictory: the checkout charge
-- path (src/utils/checkoutPricing.ts) already added a 2% fee ON TOP of the
-- ticket price for the customer to pay, AND record_organizer_earning
-- separately DEDUCTED 2% from the organizer's ledger earning — so Abonten
-- effectively collected ~4% and the organizer never received the full ticket
-- price they set.
--
-- New model (confirmed business decision):
--   * The organizer receives 100% of the ticket price they set. It is
--     recorded as a pending earning and becomes withdrawable only after the
--     event settles (is_event_settled(), unchanged — 48h after the event
--     ends). record_organizer_earning no longer computes or deducts a fee.
--   * Abonten's service fee (5% to start) is charged to the CUSTOMER on top
--     of the ticket price at checkout and is recorded here, separately, in
--     platform_fee_entry — never in the organizer's ledger, never part of
--     the organizer's pending/available balance.
--   * The rate lives in one place, platform_fee_config, editable later
--     without a code deploy. Both this schema's RPCs and the app's checkout
--     charge path read it from there.
--   * Payment-processing cost (Paystack's own fee) is recorded on
--     platform_fee_entry when Paystack reports it (verify response `fees`),
--     kept distinct from the customer-facing service fee.
--   * Refund treatment (confirmed): on any refund the customer is returned
--     the ticket price only; the service fee is RETAINED by Abonten.
--     issueRefund therefore requests a PARTIAL Paystack refund (ticket
--     revenue only) and record_fee_refund_adjustment writes an explicit
--     audit row showing the fee was kept (net_revenue impact 0).
--
-- Forward-only: existing organizer_ledger_entry 'earning' rows keep their
-- locked-in gross/fee split. Nothing here rewrites historical balances.

-- ---------------------------------------------------------------------
-- platform_fee_config: the single source of truth for the service-fee rate.
-- A NULL currency row is the global default; a currency-specific row (if
-- ever added) wins for that currency. The rate is not secret — the customer
-- sees it at checkout — so SELECT is public; only service_role can write.
-- ---------------------------------------------------------------------
CREATE TABLE public.platform_fee_config (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_rate       numeric(6,4) NOT NULL CHECK (fee_rate >= 0 AND fee_rate < 1),
  currency       varchar(3),
  effective_from timestamp with time zone NOT NULL DEFAULT now(),
  is_active      boolean NOT NULL DEFAULT true,
  note           text,
  created_at     timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_fee_config_active
  ON public.platform_fee_config (currency, effective_from DESC)
  WHERE is_active;

ALTER TABLE public.platform_fee_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_fee_config_public_read ON public.platform_fee_config
  FOR SELECT USING (true);

GRANT SELECT ON public.platform_fee_config TO anon;
GRANT SELECT ON public.platform_fee_config TO authenticated;
GRANT ALL ON public.platform_fee_config TO service_role;

-- Initial startup pricing: 5% customer service fee, meant to cover both
-- payment-processing cost and Abonten's platform revenue.
INSERT INTO public.platform_fee_config (fee_rate, currency, note)
VALUES (0.0500, NULL, 'Initial startup pricing: 5% customer-paid service fee (covers payment processing + platform revenue)');

-- ---------------------------------------------------------------------
-- get_active_platform_fee_rate: resolves the rate in effect now for a
-- currency, preferring a currency-specific config row over the global
-- (NULL-currency) default. STABLE, not SECURITY DEFINER — it reads a
-- publicly-readable table and runs fine as the calling role.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_platform_fee_rate(p_currency text DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT c.fee_rate
  FROM public.platform_fee_config c
  WHERE c.is_active
    AND c.effective_from <= now()
    AND (c.currency IS NULL OR c.currency = p_currency)
  ORDER BY (c.currency IS NOT NULL AND c.currency = p_currency) DESC,
           c.effective_from DESC
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_active_platform_fee_rate(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_active_platform_fee_rate(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_platform_fee_rate(text) TO service_role;

-- ---------------------------------------------------------------------
-- platform_fee_entry: append-only record of Abonten's fee revenue, one row
-- per successful ticket purchase (entry_type 'fee'), plus one adjustment row
-- per refunded transaction (entry_type 'fee_refund_adjustment'). This is
-- Abonten-internal financial data — RLS is enabled with NO policy, so only
-- service_role (which bypasses RLS) and the SECURITY DEFINER RPCs below can
-- read/write it. Never exposed to organizers or buyers.
--
--   ticket_revenue         — the organizer's gross ticket price (what the
--                            organizer is credited; excludes the fee)
--   service_fee            — the customer-facing Abonten fee for this sale
--   total_customer_payment — ticket_revenue + service_fee (what Paystack
--                            actually captured)
--   processing_cost        — Paystack's own fee for this charge, when
--                            reported; NULL when unavailable (never assumed)
--   net_revenue            — service_fee - processing_cost, or NULL when
--                            processing_cost is unknown
--   fee_rate               — the rate applied, locked in at sale time so a
--                            later rate change can't rewrite this record
-- ---------------------------------------------------------------------
CREATE TABLE public.platform_fee_entry (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id         uuid NOT NULL REFERENCES public.transaction(id) ON DELETE CASCADE,
  event_id               uuid REFERENCES public.event(id) ON DELETE SET NULL,
  entry_type             text NOT NULL CHECK (entry_type IN ('fee', 'fee_refund_adjustment')),
  ticket_revenue         numeric(12,2) NOT NULL,
  service_fee            numeric(12,2) NOT NULL,
  total_customer_payment numeric(12,2) NOT NULL,
  processing_cost        numeric(12,2),
  net_revenue            numeric(12,2),
  fee_rate               numeric(6,4) NOT NULL,
  currency               varchar(3) NOT NULL,
  created_at             timestamp with time zone NOT NULL DEFAULT now()
);

-- Idempotency: at most one 'fee' row and one 'fee_refund_adjustment' row per
-- transaction, so record_platform_fee / record_fee_refund_adjustment are
-- safe under webhook retries and the client-verify + webhook both firing
-- (same approach as organizer_ledger_entry_earning_once).
CREATE UNIQUE INDEX platform_fee_entry_fee_once
  ON public.platform_fee_entry (transaction_id)
  WHERE entry_type = 'fee';

CREATE UNIQUE INDEX platform_fee_entry_refund_once
  ON public.platform_fee_entry (transaction_id)
  WHERE entry_type = 'fee_refund_adjustment';

CREATE INDEX idx_platform_fee_entry_created
  ON public.platform_fee_entry (created_at DESC, id DESC);
CREATE INDEX idx_platform_fee_entry_event
  ON public.platform_fee_entry (event_id) WHERE event_id IS NOT NULL;

ALTER TABLE public.platform_fee_entry ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.platform_fee_entry TO authenticated;
GRANT ALL ON public.platform_fee_entry TO service_role;

-- ---------------------------------------------------------------------
-- record_organizer_earning: REPLACED. The organizer now receives the full
-- ticket price (amount = gross_amount = tc.total_price, fee_amount = 0).
-- fee_amount is kept on the row (as 0) so historical rows that carried a 2%
-- deduction stay readable and every downstream aggregation keeps working
-- unchanged. Everything else about this function — its signature, its
-- SECURITY DEFINER context (buyer's session on the client-verify fast path,
-- service-role on the webhook), its idempotency via
-- organizer_ledger_entry_earning_once — is identical to before.
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

  -- Customer-paid-service-fee model: no deduction. The Abonten fee is
  -- charged to the customer on top and recorded in platform_fee_entry.
  INSERT INTO public.organizer_ledger_entry (
    organizer_id, event_id, ticket_checkout_id, entry_type, amount, gross_amount, fee_amount, currency
  ) VALUES (
    v_organizer_id, v_event_id, p_ticket_checkout_id, 'earning', v_gross, v_gross, 0, v_currency
  )
  ON CONFLICT (ticket_checkout_id) WHERE entry_type = 'earning' DO NOTHING;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_organizer_earning(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_organizer_earning(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- record_platform_fee: called from src/utils/finalizePaystackPayment.ts
-- once a Paystack charge is verified and every ticket in it has been issued.
-- One row per transaction. Aggregates the pure ticket revenue across every
-- ticket_checkout row this transaction's tickets came from (a single charge
-- can span several checkout rows, and rarely several events), derives the
-- service fee as (what Paystack captured) - (ticket revenue), and stores the
-- processing cost the caller passes through from Paystack's verify response.
-- SECURITY DEFINER: the buyer's own session (client-verify path) has no
-- write access to platform_fee_entry.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_platform_fee(
  p_transaction_id  uuid,
  p_processing_cost numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_ticket_revenue numeric(12,2);
  v_currency       varchar(3);
  v_distinct_events integer;
  v_event_id       uuid;
  v_fee_rate       numeric(6,4);
  v_txn_amount     numeric(12,2);
  v_service_fee    numeric(12,2);
BEGIN
  SELECT
    COALESCE(SUM(x.total_price), 0),
    MIN(x.currency),
    COUNT(DISTINCT x.event_id),
    (array_agg(x.event_id))[1]   -- only used when COUNT(DISTINCT)=1; no min()/max() for uuid in PG15
  INTO v_ticket_revenue, v_currency, v_distinct_events, v_event_id
  FROM (
    SELECT DISTINCT tc.id, tc.total_price, tc.event_id, COALESCE(tt.currency, 'GHS') AS currency
    FROM public.ticket t
    JOIN public.ticket_checkout tc ON tc.id = t.ticket_checkout_id
    JOIN public.ticket_type tt ON tt.id = tc.ticket_type_id
    WHERE t.transaction_id = p_transaction_id
      AND t.ticket_checkout_id IS NOT NULL
  ) x;

  -- Free / fully promo-discounted purchase: no fee was ever charged.
  IF v_ticket_revenue IS NULL OR v_ticket_revenue <= 0 THEN
    RETURN;
  END IF;

  v_fee_rate := COALESCE(public.get_active_platform_fee_rate(v_currency::text), 0);

  SELECT amount INTO v_txn_amount
  FROM public.transaction
  WHERE id = p_transaction_id;

  -- The authoritative service fee is whatever Paystack actually captured
  -- beyond the ticket revenue. Fall back to the configured rate only if that
  -- difference is somehow non-positive (should never happen).
  v_service_fee := round(COALESCE(v_txn_amount, v_ticket_revenue) - v_ticket_revenue, 2);
  IF v_service_fee < 0 THEN
    v_service_fee := round(v_ticket_revenue * v_fee_rate, 2);
  END IF;

  INSERT INTO public.platform_fee_entry (
    transaction_id, event_id, entry_type,
    ticket_revenue, service_fee, total_customer_payment,
    processing_cost, net_revenue, fee_rate, currency
  ) VALUES (
    p_transaction_id,
    CASE WHEN v_distinct_events = 1 THEN v_event_id ELSE NULL END,
    'fee',
    v_ticket_revenue,
    v_service_fee,
    v_ticket_revenue + v_service_fee,
    p_processing_cost,
    CASE WHEN p_processing_cost IS NULL THEN NULL ELSE round(v_service_fee - p_processing_cost, 2) END,
    v_fee_rate,
    v_currency
  )
  ON CONFLICT (transaction_id) WHERE entry_type = 'fee' DO NOTHING;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_platform_fee(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_platform_fee(uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_platform_fee(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_platform_fee(uuid, numeric) TO service_role;

-- ---------------------------------------------------------------------
-- get_transaction_refundable_amount: the ticket-revenue-only amount to
-- request back from Paystack for a full refund of this transaction. Mirrors
-- record_refund_hold's exact proportional attribution (a charge can cover
-- several checkout rows / events), just summed instead of inserted, and
-- without the negative sign. Because record_organizer_earning now credits
-- the full ticket price, this equals (transaction.amount - service_fee):
-- the fee is excluded, i.e. retained by Abonten.
-- SECURITY DEFINER: issueRefund runs as the buyer, who cannot read
-- organizer_ledger_entry under RLS. Only ever called right after issueRefund
-- has re-verified the caller owns the transaction.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_transaction_refundable_amount(p_transaction_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  -- gross_amount (the full ticket price), NOT amount (the earning net of any
  -- historical fee deduction) — so a legacy sale that had 2% withheld from
  -- the organizer still refunds the customer the whole ticket price. Only
  -- the customer-facing service fee is withheld from a refund.
  SELECT COALESCE(SUM(round(COALESCE(le.gross_amount, le.amount) / NULLIF(tc.quantity, 0) * refunded.units, 2)), 0)
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
$function$;

REVOKE EXECUTE ON FUNCTION public.get_transaction_refundable_amount(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_transaction_refundable_amount(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_transaction_refundable_amount(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_transaction_refundable_amount(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- record_fee_refund_adjustment: called from issueRefund.ts right after
-- record_refund_hold. Writes an explicit audit row showing that, on this
-- refund, the ticket revenue was returned to the customer and the Abonten
-- service fee was RETAINED (service_fee and net_revenue impact both 0).
-- No-op if this transaction has no 'fee' row (free purchase). SECURITY
-- DEFINER for the same reason as record_platform_fee.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_fee_refund_adjustment(p_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_fee_row    public.platform_fee_entry%ROWTYPE;
  v_refundable numeric(12,2);
BEGIN
  SELECT * INTO v_fee_row
  FROM public.platform_fee_entry
  WHERE transaction_id = p_transaction_id AND entry_type = 'fee';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_refundable := public.get_transaction_refundable_amount(p_transaction_id);

  INSERT INTO public.platform_fee_entry (
    transaction_id, event_id, entry_type,
    ticket_revenue, service_fee, total_customer_payment,
    processing_cost, net_revenue, fee_rate, currency
  ) VALUES (
    p_transaction_id,
    v_fee_row.event_id,
    'fee_refund_adjustment',
    -1 * v_refundable,
    0,
    -1 * v_refundable,
    NULL,
    0,
    v_fee_row.fee_rate,
    v_fee_row.currency
  )
  ON CONFLICT (transaction_id) WHERE entry_type = 'fee_refund_adjustment' DO NOTHING;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_fee_refund_adjustment(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_fee_refund_adjustment(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_fee_refund_adjustment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_fee_refund_adjustment(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- get_organizer_ledger_transactions: unchanged except the 'platform_fee'
-- display line is now suppressed when fee_amount is 0 — under the new model
-- new sales carry no organizer-side fee, so there is nothing to show;
-- historical rows that DID carry a 2% deduction still render their line.
-- Full body reproduced from the live definition so nothing else drifts.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_organizer_ledger_transactions(
  p_cursor_created_at timestamp with time zone,
  p_cursor_id         uuid,
  p_limit             integer
)
RETURNS TABLE(
  entry_id    uuid,
  line        text,
  event_id    uuid,
  event_title text,
  amount      numeric,
  currency    text,
  status      text,
  reference   text,
  created_at  timestamp with time zone
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
      AND COALESCE(le.fee_amount, 0) <> 0

    UNION ALL

    SELECT le.id, 'refund'::text, le.event_id, e.title,
           le.amount, le.currency, 'processed'::text,
           le.transaction_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = auth.uid() AND le.entry_type = 'refund_adjustment'

    UNION ALL

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

REVOKE EXECUTE ON FUNCTION public.get_organizer_ledger_transactions(timestamp with time zone, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_organizer_ledger_transactions(timestamp with time zone, uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_organizer_ledger_transactions(timestamp with time zone, uuid, integer) TO authenticated;
