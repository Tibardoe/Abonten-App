-- Security hardening batch 4: social/profile domain -- user_info,
-- user_status, notification, favorite(+partitions), highlight, story,
-- review(+partitions), user_image_history(+partitions), media_audit.

-- ---------------------------------------------------------------------
-- user_info -- profile data is intentionally public (matches the existing
-- user_profile_details view). Self-update, but is_admin/status_id are
-- privileged columns a user must never be able to flip on themselves via a
-- raw PATCH -- guarded by trigger, same technique as batches 1-3.
-- ---------------------------------------------------------------------
ALTER TABLE public.user_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_info_public_select ON public.user_info
  FOR SELECT USING (true);
CREATE POLICY user_info_self_update ON public.user_info
  FOR UPDATE USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);
CREATE POLICY user_info_admin_update ON public.user_info
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.protect_user_info_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     OR NEW.status_id IS DISTINCT FROM OLD.status_id THEN
    RAISE EXCEPTION 'Not authorized to modify this field';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.protect_user_info_privileged_columns() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER user_info_protect_columns
  BEFORE UPDATE ON public.user_info
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_info_privileged_columns();

-- ---------------------------------------------------------------------
-- user_status -- static lookup. Public read, no client write.
-- ---------------------------------------------------------------------
ALTER TABLE public.user_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_status_public_select ON public.user_status
  FOR SELECT USING (true);

-- ---------------------------------------------------------------------
-- notification -- owner-only. No client INSERT policy: every notification
-- is system-generated (ensureProfileCompletionNotification.ts,
-- ticketPurchaseNotification.ts), not created by the recipient's own
-- session, so direct client inserts should stay denied by default.
-- ---------------------------------------------------------------------
ALTER TABLE public.notification ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_owner_select ON public.notification
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY notification_owner_update ON public.notification
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- favorite (events) -- owner-only, on the parent; each hash partition gets
-- RLS enabled with NO policy of its own, so direct partition-name access
-- (bypassing the parent) is denied outright -- same pattern already applied
-- to payment_method_p0..p3.
-- ---------------------------------------------------------------------
ALTER TABLE public.favorite ENABLE ROW LEVEL SECURITY;

CREATE POLICY favorite_owner_all ON public.favorite
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

ALTER TABLE public.favorite_p1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_p2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_p3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_p4 ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- highlight / story -- confirmed public profile content (like Instagram
-- highlights/stories): public read, owner-only write. story currently has
-- 0 partitions (known gap, can't hold rows yet either way).
-- ---------------------------------------------------------------------
ALTER TABLE public.highlight ENABLE ROW LEVEL SECURITY;

CREATE POLICY highlight_public_select ON public.highlight
  FOR SELECT USING (true);
CREATE POLICY highlight_owner_insert ON public.highlight
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY highlight_owner_update ON public.highlight
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY highlight_owner_delete ON public.highlight
  FOR DELETE USING ((select auth.uid()) = user_id);

ALTER TABLE public.story ENABLE ROW LEVEL SECURITY;

CREATE POLICY story_public_select ON public.story
  FOR SELECT USING (true);
CREATE POLICY story_owner_insert ON public.story
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY story_owner_update ON public.story
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY story_owner_delete ON public.story
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- review (legacy person-to-person organizer review, distinct from
-- event_review/place_review) -- public reads approved reviews; reviewer
-- owns their own row. Parent gets the real policies; every monthly
-- partition + review_default gets RLS enabled with no policy (same
-- direct-access-denied pattern as favorite's partitions above).
-- ---------------------------------------------------------------------
ALTER TABLE public.review ENABLE ROW LEVEL SECURITY;

CREATE POLICY review_public_select ON public.review
  FOR SELECT USING (status = 'approved');
CREATE POLICY review_reviewer_select ON public.review
  FOR SELECT USING ((select auth.uid()) = reviewer_id);
CREATE POLICY review_reviewer_insert ON public.review
  FOR INSERT WITH CHECK ((select auth.uid()) = reviewer_id);
CREATE POLICY review_reviewer_update ON public.review
  FOR UPDATE USING ((select auth.uid()) = reviewer_id) WITH CHECK ((select auth.uid()) = reviewer_id);
CREATE POLICY review_reviewer_delete ON public.review
  FOR DELETE USING ((select auth.uid()) = reviewer_id);

ALTER TABLE public.review_default ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_june_2025 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_july_2025 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_august_2025 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_september_2025 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_october_2025 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_november_2025 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_december_2025 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_january_2026 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_february_2026 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_march_2026 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_april_2026 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_may_2026 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_june_2026 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_july_2026 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_august_2026 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_september_2026 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_october_2026 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_november_2026 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_december_2026 ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- user_image_history -- avatar history, owner-only. Same parent+partition
-- pattern as favorite/review above.
-- ---------------------------------------------------------------------
ALTER TABLE public.user_image_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_image_history_owner_select ON public.user_image_history
  FOR SELECT USING ((select auth.uid()) = user_id);

ALTER TABLE public.user_image_history_0 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_image_history_1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_image_history_2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_image_history_3 ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- media_audit -- owner + admin read-only audit trail. 0 partitions
-- currently (known gap, can't hold rows yet). No client write policy --
-- this is an audit log, written server-side only.
-- ---------------------------------------------------------------------
ALTER TABLE public.media_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY media_audit_owner_select ON public.media_audit
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY media_audit_admin_select ON public.media_audit
  FOR SELECT USING (public.is_admin());
