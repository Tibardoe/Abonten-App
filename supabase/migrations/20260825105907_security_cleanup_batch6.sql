-- Security hardening batch 6: cleanup pass.
--  1. payment_method partition policies (closes the 4 rls_enabled_no_policy
--     INFO warnings -- mirrors the parent's owner policies).
--  2. auth_rls_initplan perf fix on the policies that predate this branch's
--     work (they called auth.uid() unwrapped, causing per-row
--     re-evaluation instead of a one-time InitPlan).
--  3. Convert the 2 SECURITY DEFINER views to SECURITY INVOKER so they
--     respect the RLS just added on their underlying tables instead of
--     silently bypassing it as the view owner.
--  4. Pin search_path on the 17 functions the advisor flagged as mutable.
--     'public, extensions' (not '') because several of these are pre-
--     existing functions that reference tables/PostGIS operators
--     unqualified (e.g. get_similar_events' ST_DWithin call) -- pinning to
--     '' would break them; pinning to an explicit, fixed path closes the
--     hijack vector without requiring every call site to be rewritten
--     schema-qualified.
--  5. Drop user_info's duplicate unique constraint/index.

-- 1. payment_method partitions
CREATE POLICY payment_method_p0_owner_select ON public.payment_method_p0 FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY payment_method_p0_owner_insert ON public.payment_method_p0 FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY payment_method_p0_owner_update ON public.payment_method_p0 FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY payment_method_p1_owner_select ON public.payment_method_p1 FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY payment_method_p1_owner_insert ON public.payment_method_p1 FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY payment_method_p1_owner_update ON public.payment_method_p1 FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY payment_method_p2_owner_select ON public.payment_method_p2 FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY payment_method_p2_owner_insert ON public.payment_method_p2 FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY payment_method_p2_owner_update ON public.payment_method_p2 FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY payment_method_p3_owner_select ON public.payment_method_p3 FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY payment_method_p3_owner_insert ON public.payment_method_p3 FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY payment_method_p3_owner_update ON public.payment_method_p3 FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- 2. auth_rls_initplan fix on pre-existing policies
ALTER POLICY drafts_owner_all ON public.drafts
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY event_drafts_owner_all ON public.event_drafts
  USING (EXISTS (SELECT 1 FROM public.drafts d WHERE d.id = event_drafts.draft_id AND d.user_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.drafts d WHERE d.id = event_drafts.draft_id AND d.user_id = (select auth.uid())));

ALTER POLICY review_drafts_owner_all ON public.review_drafts
  USING (EXISTS (SELECT 1 FROM public.drafts d WHERE d.id = review_drafts.draft_id AND d.user_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.drafts d WHERE d.id = review_drafts.draft_id AND d.user_id = (select auth.uid())));

ALTER POLICY place_drafts_owner_all ON public.place_drafts
  USING (EXISTS (SELECT 1 FROM public.drafts d WHERE d.id = place_drafts.draft_id AND d.user_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.drafts d WHERE d.id = place_drafts.draft_id AND d.user_id = (select auth.uid())));

ALTER POLICY transaction_owner_select ON public.transaction USING ((select auth.uid()) = user_id);
ALTER POLICY transaction_owner_insert ON public.transaction WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY transaction_owner_update ON public.transaction USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY payout_account_owner_select ON public.payout_account USING ((select auth.uid()) = organizer_id);
ALTER POLICY payout_account_owner_insert ON public.payout_account WITH CHECK ((select auth.uid()) = organizer_id);
ALTER POLICY payout_account_owner_update ON public.payout_account USING ((select auth.uid()) = organizer_id) WITH CHECK ((select auth.uid()) = organizer_id);

ALTER POLICY payout_owner_select ON public.payout USING ((select auth.uid()) = organizer_id);

ALTER POLICY organizer_ledger_entry_owner_select ON public.organizer_ledger_entry USING ((select auth.uid()) = organizer_id);

ALTER POLICY payment_attempt_owner_select ON public.payment_attempt USING ((select auth.uid()) = user_id);
ALTER POLICY payment_attempt_owner_insert ON public.payment_attempt WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY payment_attempt_owner_update ON public.payment_attempt USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY payment_method_owner_select ON public.payment_method USING ((select auth.uid()) = user_id);
ALTER POLICY payment_method_owner_insert ON public.payment_method WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY payment_method_owner_update ON public.payment_method USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- 3. SECURITY DEFINER views -> SECURITY INVOKER
ALTER VIEW public.user_profile_details SET (security_invoker = true);
ALTER VIEW public.wallet_public SET (security_invoker = true);

-- 4. Pin search_path
ALTER FUNCTION public.create_user_info_if_not_exists() SET search_path = 'public, extensions';
ALTER FUNCTION public.log_user_changes() SET search_path = 'public, extensions';
ALTER FUNCTION public.get_nearby_events(double precision, double precision, double precision) SET search_path = 'public, extensions';
ALTER FUNCTION public.get_nearby_events(double precision, double precision, double precision, timestamp with time zone, uuid, integer) SET search_path = 'public, extensions';
ALTER FUNCTION public.get_filtered_events(numeric, numeric, timestamp with time zone, timestamp with time zone, double precision, double precision, double precision, text, text, text, numeric, timestamp with time zone, double precision, uuid, integer) SET search_path = 'public, extensions';
ALTER FUNCTION public.get_filtered_events(numeric, numeric, timestamp with time zone, timestamp with time zone, double precision, double precision, double precision, text, text, text, numeric) SET search_path = 'public, extensions';
ALTER FUNCTION public.get_events_in_window(double precision, double precision, double precision, timestamp with time zone, timestamp with time zone, timestamp with time zone, uuid, integer) SET search_path = 'public, extensions';
ALTER FUNCTION public.create_place(uuid, uuid, text, text, text, smallint, double precision, double precision, jsonb, text, text, text, jsonb, text, text, jsonb, jsonb) SET search_path = 'public, extensions';
ALTER FUNCTION public.place_is_open_now(uuid, timestamp with time zone) SET search_path = 'public, extensions';
ALTER FUNCTION public.get_nearby_places(double precision, double precision, double precision, double precision, uuid, integer) SET search_path = 'public, extensions';
ALTER FUNCTION public.get_filtered_places(text, smallint, numeric, boolean, double precision, double precision, double precision, double precision, uuid, integer) SET search_path = 'public, extensions';
ALTER FUNCTION public.create_event(uuid, uuid, text, text, text, text, text, text[], double precision, double precision, jsonb, integer, text, text, text, timestamp with time zone, timestamp with time zone, boolean, boolean, jsonb, jsonb, jsonb, jsonb, uuid) SET search_path = 'public, extensions';
ALTER FUNCTION public.approve_place_claim(uuid, uuid) SET search_path = 'public, extensions';
ALTER FUNCTION public.get_active_place_promotions(double precision, double precision, double precision, integer) SET search_path = 'public, extensions';
ALTER FUNCTION public.get_similar_events(text, extensions.geography, numeric) SET search_path = 'public, extensions';
ALTER FUNCTION public.get_event_suggestions(text, integer) SET search_path = 'public, extensions';
ALTER FUNCTION public.get_place_suggestions(text, integer) SET search_path = 'public, extensions';

-- 5. Duplicate unique constraint cleanup (user_info_pkey stays; it's the
-- real PK -- user_info_id_key is an identical, redundant UNIQUE constraint
-- from before the PK existed).
ALTER TABLE public.user_info DROP CONSTRAINT IF EXISTS user_info_id_key;
