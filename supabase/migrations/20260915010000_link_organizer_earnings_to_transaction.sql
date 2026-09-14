-- Organizer earning ledger rows carried no transaction_id.
--
-- organizer_ledger_entry has a transaction_id column, and refund_hold rows
-- fill it, but every one of the 28 `earning` rows in production had it null.
-- record_organizer_earning() is passed only the ticket_checkout id and never
-- looked the payment up, so reconciling an organizer's earning back to the
-- charge that produced it meant hopping through the checkout by hand. Nothing
-- was wrong with the money — refunds use their own entries and their own link
-- — but a money trail that cannot be followed in one join is a money trail
-- that gets audited badly.
--
-- The transaction is already known at this point: issue_tickets_for_checkout
-- inserts the tickets with their transaction_id and only then loops over the
-- checkout rows calling record_organizer_earning, all inside one transaction.
-- So the function can resolve the payment from the tickets it just issued
-- rather than needing a new argument — which keeps the signature, the grants
-- (service_role only) and every caller exactly as they are.
--
-- Amounts, the conflict key and the fee split are untouched: this adds a
-- reference, it does not move money.

create or replace function public.record_organizer_earning(p_ticket_checkout_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_organizer_id uuid;
  v_event_id     uuid;
  v_gross        numeric(12,2);
  v_currency     text;
  v_transaction_id uuid;
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

  -- The tickets for this checkout were inserted moments ago in the same
  -- transaction, each carrying the transaction that paid for them. A null
  -- here (a free checkout, or a caller that issued no tickets) simply leaves
  -- the column null, exactly as before.
  SELECT t.transaction_id INTO v_transaction_id
  FROM public.ticket t
  WHERE t.ticket_checkout_id = p_ticket_checkout_id
    AND t.transaction_id IS NOT NULL
  LIMIT 1;

  INSERT INTO public.organizer_ledger_entry (
    organizer_id, event_id, ticket_checkout_id, transaction_id,
    entry_type, amount, gross_amount, fee_amount, currency
  ) VALUES (
    v_organizer_id, v_event_id, p_ticket_checkout_id, v_transaction_id,
    'earning', v_gross, v_gross, 0, v_currency
  )
  ON CONFLICT (ticket_checkout_id) WHERE entry_type = 'earning' DO NOTHING;
END;
$function$;

-- Backfill the rows written before this change, from the same source the
-- function now reads. Only fills nulls; never overwrites an existing link.
UPDATE public.organizer_ledger_entry le
SET transaction_id = t.transaction_id
FROM (
  SELECT DISTINCT ON (ticket_checkout_id) ticket_checkout_id, transaction_id
  FROM public.ticket
  WHERE transaction_id IS NOT NULL
  ORDER BY ticket_checkout_id, created_at
) t
WHERE le.ticket_checkout_id = t.ticket_checkout_id
  AND le.entry_type = 'earning'
  AND le.transaction_id IS NULL;
