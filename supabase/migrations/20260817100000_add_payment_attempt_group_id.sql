-- Lets several per-session payment_attempt rows (one per checkout session
-- selected in a multi-checkout "pay for several at once" action) be tagged
-- as belonging to one combined pay action, while each row stays individually
-- traceable to the single checkout_session_id it pays for. Nullable/additive
-- — a payment_attempt created for one checkout (or a subscription) as before
-- simply leaves this null.
ALTER TABLE public.payment_attempt
  ADD COLUMN payment_group_id uuid;

CREATE INDEX idx_payment_attempt_payment_group
  ON public.payment_attempt (payment_group_id)
  WHERE payment_group_id IS NOT NULL;
