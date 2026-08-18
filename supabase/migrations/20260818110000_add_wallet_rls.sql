-- payment_method and payment_attempt now hold genuinely sensitive data for
-- the first time (a real mobile money phone number, and a live
-- charge-capable Paystack authorization token) rather than just display
-- labels. This schema otherwise has no RLS anywhere (see PROJECT.md/
-- CLAUDE.md — a known, intentionally-unfixed gap for the rest of the app),
-- but that gap is no longer acceptable for these two tables specifically.
--
-- Every existing query already scopes by user_id (getUserPaymentMethods,
-- addPaymentMethod, removePaymentMethod, setDefaultPaymentMethod,
-- createPaymentAttempt, createMultiCheckoutPaymentAttempt,
-- finalizePaystackPayment's cookie-bound call path), so this is additive
-- hardening, not a functional change. The Paystack webhook uses the
-- service-role client (src/config/supabase/serviceClient.ts), which bypasses
-- RLS by design — its ability to finalize any user's payment is unaffected.

ALTER TABLE public.payment_attempt ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_attempt_owner_select ON public.payment_attempt
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY payment_attempt_owner_insert ON public.payment_attempt
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY payment_attempt_owner_update ON public.payment_attempt
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- payment_method is HASH-partitioned (p0..p3). Postgres only enforces RLS
-- for a table that itself has RLS enabled, so the parent and each partition
-- all need it (matches what the Supabase advisor already flags for the
-- partitions individually).
ALTER TABLE public.payment_method ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_method_p0 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_method_p1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_method_p2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_method_p3 ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_method_owner_select ON public.payment_method
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY payment_method_owner_insert ON public.payment_method
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY payment_method_owner_update ON public.payment_method
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
