-- Security hardening batch 3: places domain.
--
-- Also closes a real authorization gap found while designing this batch:
-- public.approve_place_claim(p_request_id, p_admin_id) is SECURITY INVOKER
-- and only checks is_admin for whatever p_admin_id the CALLER supplies as a
-- parameter -- it never verifies that p_admin_id is actually auth.uid().
-- Today, with no RLS at all, any authenticated user could call it passing a
-- real admin's id and it would still update `place`/`place_claim_request`
-- successfully. Gating those two tables' admin UPDATE policies on
-- is_admin() evaluated against (select auth.uid()) -- not any
-- client-supplied id -- closes this: the function's own internal check can
-- still be spoofed, but the actual UPDATE it performs now fails under RLS
-- unless the real caller is really an admin.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE((SELECT ui.is_admin FROM public.user_info ui WHERE ui.id = auth.uid()), false);
$function$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- place -- owner owns it; public sees only published places; admin can
-- reassign ownership/claimed/verified via approve_place_claim (see above).
-- ---------------------------------------------------------------------
ALTER TABLE public.place ENABLE ROW LEVEL SECURITY;

CREATE POLICY place_public_select ON public.place
  FOR SELECT USING (status = 'published');
CREATE POLICY place_owner_select ON public.place
  FOR SELECT USING ((select auth.uid()) = owner_id);
CREATE POLICY place_owner_insert ON public.place
  FOR INSERT WITH CHECK ((select auth.uid()) = owner_id);
CREATE POLICY place_owner_update ON public.place
  FOR UPDATE USING ((select auth.uid()) = owner_id) WITH CHECK ((select auth.uid()) = owner_id);
CREATE POLICY place_owner_delete ON public.place
  FOR DELETE USING ((select auth.uid()) = owner_id);
CREATE POLICY place_admin_update ON public.place
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- place_category -- static lookup. Public read, no client write.
-- ---------------------------------------------------------------------
ALTER TABLE public.place_category ENABLE ROW LEVEL SECURITY;

CREATE POLICY place_category_public_select ON public.place_category
  FOR SELECT USING (true);

-- ---------------------------------------------------------------------
-- place_photo / place_opening_hours / place_service -- owner-managed,
-- publicly visible when the parent place is published.
-- ---------------------------------------------------------------------
ALTER TABLE public.place_photo ENABLE ROW LEVEL SECURITY;

CREATE POLICY place_photo_public_select ON public.place_photo
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.place p WHERE p.id = place_photo.place_id AND p.status = 'published')
  );
CREATE POLICY place_photo_owner_all ON public.place_photo
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.place p WHERE p.id = place_photo.place_id AND p.owner_id = (select auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.place p WHERE p.id = place_photo.place_id AND p.owner_id = (select auth.uid()))
  );

ALTER TABLE public.place_opening_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY place_opening_hours_public_select ON public.place_opening_hours
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.place p WHERE p.id = place_opening_hours.place_id AND p.status = 'published')
  );
CREATE POLICY place_opening_hours_owner_all ON public.place_opening_hours
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.place p WHERE p.id = place_opening_hours.place_id AND p.owner_id = (select auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.place p WHERE p.id = place_opening_hours.place_id AND p.owner_id = (select auth.uid()))
  );

ALTER TABLE public.place_service ENABLE ROW LEVEL SECURITY;

CREATE POLICY place_service_public_select ON public.place_service
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.place p WHERE p.id = place_service.place_id AND p.status = 'published')
  );
CREATE POLICY place_service_owner_all ON public.place_service
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.place p WHERE p.id = place_service.place_id AND p.owner_id = (select auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.place p WHERE p.id = place_service.place_id AND p.owner_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------
-- place_review / place_review_photo -- same reviewer-vs-owner column split
-- as event_review in batch 2 (owner_response/_at vs rating/title/comment),
-- same trigger-based column guard.
-- ---------------------------------------------------------------------
ALTER TABLE public.place_review ENABLE ROW LEVEL SECURITY;

CREATE POLICY place_review_public_select ON public.place_review
  FOR SELECT USING (status = 'approved');
CREATE POLICY place_review_reviewer_select ON public.place_review
  FOR SELECT USING ((select auth.uid()) = reviewer_id);
CREATE POLICY place_review_owner_select ON public.place_review
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.place p WHERE p.id = place_review.place_id AND p.owner_id = (select auth.uid()))
  );
CREATE POLICY place_review_reviewer_insert ON public.place_review
  FOR INSERT WITH CHECK ((select auth.uid()) = reviewer_id);
CREATE POLICY place_review_reviewer_update ON public.place_review
  FOR UPDATE USING ((select auth.uid()) = reviewer_id) WITH CHECK ((select auth.uid()) = reviewer_id);
CREATE POLICY place_review_owner_update ON public.place_review
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.place p WHERE p.id = place_review.place_id AND p.owner_id = (select auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.place p WHERE p.id = place_review.place_id AND p.owner_id = (select auth.uid()))
  );
CREATE POLICY place_review_reviewer_delete ON public.place_review
  FOR DELETE USING ((select auth.uid()) = reviewer_id);

CREATE OR REPLACE FUNCTION public.protect_place_review_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_is_reviewer boolean := (select auth.uid()) = OLD.reviewer_id;
  v_is_owner boolean := EXISTS (
    SELECT 1 FROM public.place p WHERE p.id = OLD.place_id AND p.owner_id = (select auth.uid())
  );
BEGIN
  IF v_is_reviewer AND NOT v_is_owner THEN
    IF NEW.owner_response IS DISTINCT FROM OLD.owner_response
       OR NEW.owner_response_at IS DISTINCT FROM OLD.owner_response_at
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.place_id IS DISTINCT FROM OLD.place_id
       OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id THEN
      RAISE EXCEPTION 'Not authorized to modify this field on your review';
    END IF;
    RETURN NEW;
  END IF;

  IF v_is_owner AND NOT v_is_reviewer THEN
    IF NEW.rating IS DISTINCT FROM OLD.rating
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.comment IS DISTINCT FROM OLD.comment
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.place_id IS DISTINCT FROM OLD.place_id
       OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id THEN
      RAISE EXCEPTION 'Not authorized to modify this field on this review';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.protect_place_review_privileged_columns() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER place_review_protect_columns
  BEFORE UPDATE ON public.place_review
  FOR EACH ROW EXECUTE FUNCTION public.protect_place_review_privileged_columns();

ALTER TABLE public.place_review_photo ENABLE ROW LEVEL SECURITY;

CREATE POLICY place_review_photo_public_select ON public.place_review_photo
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.place_review r WHERE r.id = place_review_photo.place_review_id AND r.status = 'approved')
  );
CREATE POLICY place_review_photo_reviewer_all ON public.place_review_photo
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.place_review r WHERE r.id = place_review_photo.place_review_id AND r.reviewer_id = (select auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.place_review r WHERE r.id = place_review_photo.place_review_id AND r.reviewer_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------
-- place_report -- reporter files it; place owner deliberately gets NO
-- access (self-moderation risk -- an owner could see/dismiss reports about
-- their own place); only an admin reviews reports.
-- ---------------------------------------------------------------------
ALTER TABLE public.place_report ENABLE ROW LEVEL SECURITY;

CREATE POLICY place_report_reporter_select ON public.place_report
  FOR SELECT USING ((select auth.uid()) = reporter_id);
CREATE POLICY place_report_reporter_insert ON public.place_report
  FOR INSERT WITH CHECK ((select auth.uid()) = reporter_id);
CREATE POLICY place_report_admin_select ON public.place_report
  FOR SELECT USING (public.is_admin());
CREATE POLICY place_report_admin_update ON public.place_report
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- place_booking -- customer requests; place owner accepts/declines.
-- ---------------------------------------------------------------------
ALTER TABLE public.place_booking ENABLE ROW LEVEL SECURITY;

CREATE POLICY place_booking_customer_select ON public.place_booking
  FOR SELECT USING ((select auth.uid()) = customer_id);
CREATE POLICY place_booking_owner_select ON public.place_booking
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.place p WHERE p.id = place_booking.place_id AND p.owner_id = (select auth.uid()))
  );
CREATE POLICY place_booking_customer_insert ON public.place_booking
  FOR INSERT WITH CHECK ((select auth.uid()) = customer_id);
CREATE POLICY place_booking_customer_update ON public.place_booking
  FOR UPDATE USING ((select auth.uid()) = customer_id) WITH CHECK ((select auth.uid()) = customer_id);
CREATE POLICY place_booking_owner_update ON public.place_booking
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.place p WHERE p.id = place_booking.place_id AND p.owner_id = (select auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.place p WHERE p.id = place_booking.place_id AND p.owner_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------
-- place_claim_request -- claimant files it; admin reviews/approves (see
-- approve_place_claim note above).
-- ---------------------------------------------------------------------
ALTER TABLE public.place_claim_request ENABLE ROW LEVEL SECURITY;

CREATE POLICY place_claim_request_claimant_select ON public.place_claim_request
  FOR SELECT USING ((select auth.uid()) = claimant_id);
CREATE POLICY place_claim_request_claimant_insert ON public.place_claim_request
  FOR INSERT WITH CHECK ((select auth.uid()) = claimant_id);
CREATE POLICY place_claim_request_admin_select ON public.place_claim_request
  FOR SELECT USING (public.is_admin());
CREATE POLICY place_claim_request_admin_update ON public.place_claim_request
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- place_analytics_event -- anonymous page-view/click analytics, no owner
-- concept for the writer; only the place owner reads their own analytics.
-- ---------------------------------------------------------------------
ALTER TABLE public.place_analytics_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY place_analytics_event_public_insert ON public.place_analytics_event
  FOR INSERT WITH CHECK (true);
CREATE POLICY place_analytics_event_owner_select ON public.place_analytics_event
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.place p WHERE p.id = place_analytics_event.place_id AND p.owner_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------
-- place_promotion(_tier)/place_promotion_checkout -- same shape as
-- event_promotion in batch 2: promotion status/tier pricing are public
-- (get_active_place_promotions is SECURITY INVOKER, called by anon
-- visitors); the checkout/payment record is owner-only.
-- ---------------------------------------------------------------------
ALTER TABLE public.place_promotion_tier ENABLE ROW LEVEL SECURITY;

CREATE POLICY place_promotion_tier_public_select ON public.place_promotion_tier
  FOR SELECT USING (true);

ALTER TABLE public.place_promotion ENABLE ROW LEVEL SECURITY;

CREATE POLICY place_promotion_public_select ON public.place_promotion
  FOR SELECT USING (true);

ALTER TABLE public.place_promotion_checkout ENABLE ROW LEVEL SECURITY;

CREATE POLICY place_promotion_checkout_owner_select ON public.place_promotion_checkout
  FOR SELECT USING ((select auth.uid()) = owner_id);
CREATE POLICY place_promotion_checkout_owner_insert ON public.place_promotion_checkout
  FOR INSERT WITH CHECK ((select auth.uid()) = owner_id);
CREATE POLICY place_promotion_checkout_owner_update ON public.place_promotion_checkout
  FOR UPDATE USING ((select auth.uid()) = owner_id) WITH CHECK ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------
-- favorite_place -- owner-only, mirrors the existing `favorite` (events)
-- table's shape.
-- ---------------------------------------------------------------------
ALTER TABLE public.favorite_place ENABLE ROW LEVEL SECURITY;

CREATE POLICY favorite_place_owner_all ON public.favorite_place
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
