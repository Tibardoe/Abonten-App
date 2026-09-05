-- Follow-up to 20260903130000_add_customer_paid_service_fee.sql (applied
-- minutes earlier): get_transaction_refundable_amount summed the ledger
-- `amount` (the organizer earning), which for sales recorded BEFORE the
-- customer-paid-fee migration is the ticket price minus the old 2% platform
-- deduction. That would short a legacy refund by that 2% (e.g. a GHS 100
-- ticket, customer charged 102, would only refund 98). It must use
-- gross_amount (the full ticket price) so every refund returns the whole
-- ticket price to the customer and withholds only the customer-facing
-- service fee. New sales are unaffected — record_organizer_earning now sets
-- amount = gross_amount, so both columns agree going forward.
--
-- (This exists as a second migration only because 20260903130000 was already
-- applied; the fix is also folded into that file for fresh installs.)
CREATE OR REPLACE FUNCTION public.get_transaction_refundable_amount(p_transaction_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
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
