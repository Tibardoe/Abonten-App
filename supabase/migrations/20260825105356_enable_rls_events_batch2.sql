-- Security hardening batch 2: event and everything hanging off it --
-- event, event_occurrence, event_media, ticket_type, attendance,
-- event_review, event_review_photo, event_share, event_promotion(+tier,
-- +checkout). Same rationale as batch 1: RLS was fully off with default
-- anon/authenticated grants.

-- ---------------------------------------------------------------------
-- event -- organizer owns it; public sees only published events.
-- ---------------------------------------------------------------------
ALTER TABLE public.event ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_public_select ON public.event
  FOR SELECT USING (status = 'published');
CREATE POLICY event_organizer_select ON public.event
  FOR SELECT USING ((select auth.uid()) = organizer_id);
CREATE POLICY event_organizer_insert ON public.event
  FOR INSERT WITH CHECK ((select auth.uid()) = organizer_id);
CREATE POLICY event_organizer_update ON public.event
  FOR UPDATE USING ((select auth.uid()) = organizer_id) WITH CHECK ((select auth.uid()) = organizer_id);
CREATE POLICY event_organizer_delete ON public.event
  FOR DELETE USING ((select auth.uid()) = organizer_id);

-- ---------------------------------------------------------------------
-- event_occurrence / event_media -- no owner column of their own, scoped
-- via event.organizer_id. event_media currently has 0 partitions (known
-- gap, see CLAUDE.md/PROJECT.md) so it can't hold rows yet either way.
-- ---------------------------------------------------------------------
ALTER TABLE public.event_occurrence ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_occurrence_public_select ON public.event_occurrence
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.event e WHERE e.id = event_occurrence.event_id AND e.status = 'published')
  );
CREATE POLICY event_occurrence_organizer_all ON public.event_occurrence
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.event e WHERE e.id = event_occurrence.event_id AND e.organizer_id = (select auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.event e WHERE e.id = event_occurrence.event_id AND e.organizer_id = (select auth.uid()))
  );

ALTER TABLE public.event_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_media_public_select ON public.event_media
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.event e WHERE e.id = event_media.event_id AND e.status = 'published')
  );
CREATE POLICY event_media_organizer_all ON public.event_media
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.event e WHERE e.id = event_media.event_id AND e.organizer_id = (select auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.event e WHERE e.id = event_media.event_id AND e.organizer_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------
-- ticket_type -- public if the parent event is published; organizer-owned
-- otherwise (updateEventTicketTypes.ts runs under the organizer's session).
-- ---------------------------------------------------------------------
ALTER TABLE public.ticket_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY ticket_type_public_select ON public.ticket_type
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.event e WHERE e.id = ticket_type.event_id AND e.status = 'published')
  );
CREATE POLICY ticket_type_organizer_all ON public.ticket_type
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.event e WHERE e.id = ticket_type.event_id AND e.organizer_id = (select auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.event e WHERE e.id = ticket_type.event_id AND e.organizer_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------
-- attendance -- has its own event_id column (no join needed for the
-- organizer check). Owner manages their own row; organizer reads/manages
-- attendance for their own event (getAttendanceList.ts, checkInTicket.ts).
-- ---------------------------------------------------------------------
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY attendance_owner_select ON public.attendance
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY attendance_organizer_select ON public.attendance
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.event e WHERE e.id = attendance.event_id AND e.organizer_id = (select auth.uid()))
  );
CREATE POLICY attendance_owner_insert ON public.attendance
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY attendance_owner_update ON public.attendance
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY attendance_organizer_update ON public.attendance
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.event e WHERE e.id = attendance.event_id AND e.organizer_id = (select auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.event e WHERE e.id = attendance.event_id AND e.organizer_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------
-- event_review -- public sees approved reviews; reviewer sees/owns their
-- own row; organizer of the event can reply. Two different actors write
-- the same row (reviewer writes rating/title/comment, organizer writes
-- organizer_response/_at) so, same as promo_code in batch 1, a trigger
-- enforces which columns each side may actually change -- a plain
-- owner-scoped or organizer-scoped UPDATE policy alone can't express that.
-- ---------------------------------------------------------------------
ALTER TABLE public.event_review ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_review_public_select ON public.event_review
  FOR SELECT USING (status = 'approved');
CREATE POLICY event_review_reviewer_select ON public.event_review
  FOR SELECT USING ((select auth.uid()) = reviewer_id);
CREATE POLICY event_review_organizer_select ON public.event_review
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.event e WHERE e.id = event_review.event_id AND e.organizer_id = (select auth.uid()))
  );
CREATE POLICY event_review_reviewer_insert ON public.event_review
  FOR INSERT WITH CHECK ((select auth.uid()) = reviewer_id);
CREATE POLICY event_review_reviewer_update ON public.event_review
  FOR UPDATE USING ((select auth.uid()) = reviewer_id) WITH CHECK ((select auth.uid()) = reviewer_id);
CREATE POLICY event_review_organizer_update ON public.event_review
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.event e WHERE e.id = event_review.event_id AND e.organizer_id = (select auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.event e WHERE e.id = event_review.event_id AND e.organizer_id = (select auth.uid()))
  );
CREATE POLICY event_review_reviewer_delete ON public.event_review
  FOR DELETE USING ((select auth.uid()) = reviewer_id);

CREATE OR REPLACE FUNCTION public.protect_event_review_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_is_reviewer boolean := (select auth.uid()) = OLD.reviewer_id;
  v_is_organizer boolean := EXISTS (
    SELECT 1 FROM public.event e WHERE e.id = OLD.event_id AND e.organizer_id = (select auth.uid())
  );
BEGIN
  IF v_is_reviewer AND NOT v_is_organizer THEN
    IF NEW.organizer_response IS DISTINCT FROM OLD.organizer_response
       OR NEW.organizer_response_at IS DISTINCT FROM OLD.organizer_response_at
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.event_id IS DISTINCT FROM OLD.event_id
       OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id THEN
      RAISE EXCEPTION 'Not authorized to modify this field on your review';
    END IF;
    RETURN NEW;
  END IF;

  IF v_is_organizer AND NOT v_is_reviewer THEN
    IF NEW.rating IS DISTINCT FROM OLD.rating
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.comment IS DISTINCT FROM OLD.comment
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.event_id IS DISTINCT FROM OLD.event_id
       OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
       OR NEW.is_verified_attendee IS DISTINCT FROM OLD.is_verified_attendee THEN
      RAISE EXCEPTION 'Not authorized to modify this field on this review';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.protect_event_review_privileged_columns() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER event_review_protect_columns
  BEFORE UPDATE ON public.event_review
  FOR EACH ROW EXECUTE FUNCTION public.protect_event_review_privileged_columns();

ALTER TABLE public.event_review_photo ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_review_photo_public_select ON public.event_review_photo
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.event_review r WHERE r.id = event_review_photo.event_review_id AND r.status = 'approved')
  );
CREATE POLICY event_review_photo_reviewer_all ON public.event_review_photo
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.event_review r WHERE r.id = event_review_photo.event_review_id AND r.reviewer_id = (select auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.event_review r WHERE r.id = event_review_photo.event_review_id AND r.reviewer_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------
-- event_share -- lightweight owner-only analytics row.
-- ---------------------------------------------------------------------
ALTER TABLE public.event_share ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_share_owner_select ON public.event_share
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY event_share_owner_insert ON public.event_share
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- event_promotion(_tier)/event_promotion_checkout -- promotion status and
-- tier pricing are public (get_active_place_promotions-style listing RPCs
-- read this as SECURITY INVOKER, including for anon visitors browsing
-- public listings); the checkout/payment record itself is owner-only.
-- ---------------------------------------------------------------------
ALTER TABLE public.event_promotion_tier ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_promotion_tier_public_select ON public.event_promotion_tier
  FOR SELECT USING (true);

ALTER TABLE public.event_promotion ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_promotion_public_select ON public.event_promotion
  FOR SELECT USING (true);

ALTER TABLE public.event_promotion_checkout ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_promotion_checkout_owner_select ON public.event_promotion_checkout
  FOR SELECT USING ((select auth.uid()) = owner_id);
CREATE POLICY event_promotion_checkout_owner_insert ON public.event_promotion_checkout
  FOR INSERT WITH CHECK ((select auth.uid()) = owner_id);
CREATE POLICY event_promotion_checkout_owner_update ON public.event_promotion_checkout
  FOR UPDATE USING ((select auth.uid()) = owner_id) WITH CHECK ((select auth.uid()) = owner_id);
