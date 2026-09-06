-- get_transaction_refundable_amount previously computed the ticket-revenue-
-- only refund amount by joining through organizer_ledger_entry's 'earning'
-- row. That row is written by record_organizer_earning inside the same
-- atomic transaction as ticket issuance (issue_tickets_for_checkout), so in
-- theory it's always present alongside the ticket. In practice, a refund
-- requested in the brief window right after a purchase (e.g. an organizer
-- cancelling an event seconds after a ticket was bought) could still race
-- ahead of that transaction's visibility to a separate connection, making
-- this function return 0 despite real tickets existing. issueRefundCore.ts's
-- fallback for exactly that "0 despite real tickets" case is to refund the
-- FULL amount (including the Abonten service fee) instead of ticket revenue
-- only -- a real, confirmed revenue leak, reproduced live on 2026-09-06
-- (transaction 998e8379-b5c9-4e4e-a9bb-5130e7f1e860: this function returned
-- 0 at refund time; re-run moments later on the same data returned the
-- correct 100.00).
--
-- Fix: compute the refundable amount directly from ticket_checkout.total_price
-- (the exact same source record_organizer_earning itself reads for
-- gross_amount -- see 20260830195535_add_customer_paid_service_fee.sql's
-- record_organizer_earning, which sets gross_amount := tc.total_price
-- verbatim), instead of through the earning ledger row. total_price is set
-- when the checkout row itself is created, well before payment or ticket
-- issuance, so this has no timing dependency on any later bookkeeping step
-- and produces numerically identical results to the old formula whenever
-- the earning row *did* already exist -- this is a robustness fix, not a
-- behavior change. t.transaction_id = p_transaction_id already guarantees
-- only tickets from a real paid transaction are counted (free-checkout
-- tickets always have transaction_id NULL), so no separate ticket_checkout
-- status filter is needed -- and none should be added: by the time a
-- cancel-event refund runs, the checkout may already be 'cancelled', which
-- would wrongly exclude it if filtered on status = 'paid'.
CREATE OR REPLACE FUNCTION public.get_transaction_refundable_amount(p_transaction_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(SUM(round(tc.total_price / NULLIF(tc.quantity, 0) * refunded.units, 2)), 0)
  FROM (
    SELECT t.ticket_checkout_id, COUNT(*) AS units
    FROM public.ticket t
    WHERE t.transaction_id = p_transaction_id
      AND t.ticket_checkout_id IS NOT NULL
    GROUP BY t.ticket_checkout_id
  ) refunded
  JOIN public.ticket_checkout tc ON tc.id = refunded.ticket_checkout_id;
$function$;
