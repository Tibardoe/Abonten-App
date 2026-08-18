-- Adds the columns Paystack integration needs to the existing payment_attempt
-- table, rather than introducing a parallel payment table. payment_attempt
-- already had the right shape for this (status enum, an unused
-- provider_reference column) — see createPaymentAttempt.ts's original
-- doc-comment, which already anticipated "a future gateway webhook/verify
-- step" driving this table. The legacy transaction table is deliberately
-- left untouched: it requires a NOT NULL UNIQUE flutterwave_txn_id and has
-- never been written to by any code in this repo (a known, flagged
-- discrepancy — not something this migration silently "fixes").

ALTER TABLE public.payment_attempt
  ADD COLUMN provider text NOT NULL DEFAULT 'paystack',
  ADD COLUMN paid_at timestamptz,
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN failure_reason text,
  ADD COLUMN metadata jsonb;

-- One Paystack reference can only ever belong to one payment_attempt row.
-- Partial (WHERE NOT NULL) because grouped multi-checkout payments (see
-- createMultiCheckoutPaymentAttempt.ts) only store the shared Paystack
-- reference on the group's primary attempt row — sibling rows in the same
-- payment_group_id are finalized alongside the primary but never get their
-- own Paystack transaction, so their provider_reference stays null.
CREATE UNIQUE INDEX payment_attempt_provider_reference_key
  ON public.payment_attempt (provider_reference)
  WHERE provider_reference IS NOT NULL;
