-- Security hardening batch 5: subscriptions domain.

ALTER TABLE public.subscription ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscription_owner_select ON public.subscription
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY subscription_owner_insert ON public.subscription
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY subscription_owner_update ON public.subscription
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

ALTER TABLE public.subscription_checkout ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscription_checkout_owner_select ON public.subscription_checkout
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY subscription_checkout_owner_insert ON public.subscription_checkout
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY subscription_checkout_owner_update ON public.subscription_checkout
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- Lookup table: public read, no client write.
ALTER TABLE public.subscription_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscription_plan_public_select ON public.subscription_plan
  FOR SELECT USING (true);
