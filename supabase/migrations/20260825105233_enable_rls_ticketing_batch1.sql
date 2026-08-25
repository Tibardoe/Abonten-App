-- Security hardening batch 1 (highest-risk tables): receiving_account,
-- ticket, ticket_checkout, promo_code, promo_code_usage, transaction_status.
-- These currently have RLS fully disabled while also carrying Supabase's
-- default GRANT ALL to anon/authenticated, meaning any API caller can
-- currently read/write these rows directly via PostgREST, bypassing every
-- Server Action's own auth.getUser() check entirely.
--
-- Ownership verified against actual Server Action write paths (all use the
-- cookie-bound user-session client from @/config/supabase/server, never
-- service-role), not guessed from column names:
--   - cancelUserTicket.ts: owner updates own ticket/attendance rows.
--   - checkInTicket.ts: organizer (via ticket_type -> event.organizer_id)
--     updates a ticket row that is NOT theirs by ownership -- only by event.
--   - getAttendanceList.ts / event analytics RPCs: organizer reads
--     ticket_checkout/attendance for their own event.
--   - updateTicketCheckoutQuantity.ts / cancelTicketCheckoutSession.ts:
--     owner-only, scoped to their own pending checkout.
--   - promoUsage.ts (claimPromoUsage/adjustPromoUsageUnits/releasePromoUsage):
--     ANY authenticated buyer -- not just the organizer -- legitimately
--     updates promo_code.times_used as part of checkout (a CAS redemption
--     counter). A plain owner-scoped policy would either block this (if
--     scoped to organizer) or let any buyer silently edit another
--     organizer's discount_percentage/max_uses/is_active (if left
--     unrestricted). Neither is acceptable, so promo_code gets a trigger
--     that allows the organizer to change any column, but restricts every
--     other authenticated caller to touching only times_used.

-- ---------------------------------------------------------------------
-- receiving_account -- organizer's payout destination for one event.
-- Never public, never accessible to any other user.
-- ---------------------------------------------------------------------
ALTER TABLE public.receiving_account ENABLE ROW LEVEL SECURITY;

CREATE POLICY receiving_account_owner_select ON public.receiving_account
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY receiving_account_owner_insert ON public.receiving_account
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY receiving_account_owner_update ON public.receiving_account
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY receiving_account_owner_delete ON public.receiving_account
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- ticket -- buyer owns it; the event's organizer needs it too (check-in,
-- attendee lists), via ticket_type -> event.organizer_id.
-- ---------------------------------------------------------------------
ALTER TABLE public.ticket ENABLE ROW LEVEL SECURITY;

CREATE POLICY ticket_owner_select ON public.ticket
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY ticket_organizer_select ON public.ticket
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.ticket_type tt
      JOIN public.event e ON e.id = tt.event_id
      WHERE tt.id = ticket.ticket_type_id AND e.organizer_id = (select auth.uid())
    )
  );
CREATE POLICY ticket_owner_insert ON public.ticket
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY ticket_owner_update ON public.ticket
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY ticket_organizer_update ON public.ticket
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.ticket_type tt
      JOIN public.event e ON e.id = tt.event_id
      WHERE tt.id = ticket.ticket_type_id AND e.organizer_id = (select auth.uid())
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ticket_type tt
      JOIN public.event e ON e.id = tt.event_id
      WHERE tt.id = ticket.ticket_type_id AND e.organizer_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- ticket_checkout -- buyer owns it; organizer reads their event's checkouts
-- for sales/attendee views (get_event_*_analytics RPCs run SECURITY
-- INVOKER, so they need this policy to keep working under RLS).
-- ---------------------------------------------------------------------
ALTER TABLE public.ticket_checkout ENABLE ROW LEVEL SECURITY;

CREATE POLICY ticket_checkout_owner_select ON public.ticket_checkout
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY ticket_checkout_organizer_select ON public.ticket_checkout
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.event e WHERE e.id = ticket_checkout.event_id AND e.organizer_id = (select auth.uid()))
  );
CREATE POLICY ticket_checkout_owner_insert ON public.ticket_checkout
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY ticket_checkout_owner_update ON public.ticket_checkout
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- promo_code -- organizer manages their event's codes; any authenticated
-- buyer can read codes (to validate at checkout) and touch times_used only.
-- ---------------------------------------------------------------------
ALTER TABLE public.promo_code ENABLE ROW LEVEL SECURITY;

CREATE POLICY promo_code_authenticated_select ON public.promo_code
  FOR SELECT TO authenticated USING (true);
CREATE POLICY promo_code_organizer_all ON public.promo_code
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.event e WHERE e.id = promo_code.event_id AND e.organizer_id = (select auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.event e WHERE e.id = promo_code.event_id AND e.organizer_id = (select auth.uid()))
  );
-- Deliberately row-unrestricted (any authenticated caller, any promo_code
-- row) because claimPromoUsage/adjustPromoUsageUnits/releasePromoUsage in
-- promoUsage.ts update ANY event's promo_code.times_used on behalf of
-- whichever buyer is currently checking out -- there's no "owns this promo
-- code" relationship for a buyer. Column-level protection (so this can only
-- ever move times_used, never discount_percentage/max_uses/is_active/etc.
-- for a non-organizer) is enforced by the trigger below instead, since RLS
-- itself has no per-column granularity.
CREATE POLICY promo_code_authenticated_usage_update ON public.promo_code
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.protect_promo_code_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.event e WHERE e.id = NEW.event_id AND e.organizer_id = (select auth.uid())
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.promo_code IS DISTINCT FROM OLD.promo_code
     OR NEW.discount_percentage IS DISTINCT FROM OLD.discount_percentage
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.max_uses IS DISTINCT FROM OLD.max_uses
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Not authorized to modify this promo code';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.protect_promo_code_privileged_columns() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER promo_code_protect_columns
  BEFORE UPDATE ON public.promo_code
  FOR EACH ROW EXECUTE FUNCTION public.protect_promo_code_privileged_columns();

-- ---------------------------------------------------------------------
-- promo_code_usage -- one row per (promo_code, user, event); the buyer who
-- claimed it is the only one who should see/create/release it. Organizer
-- also needs read access to know how their codes were actually redeemed.
-- ---------------------------------------------------------------------
ALTER TABLE public.promo_code_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY promo_code_usage_owner_select ON public.promo_code_usage
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY promo_code_usage_organizer_select ON public.promo_code_usage
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.event e WHERE e.id = promo_code_usage.event_id AND e.organizer_id = (select auth.uid()))
  );
CREATE POLICY promo_code_usage_owner_insert ON public.promo_code_usage
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY promo_code_usage_owner_delete ON public.promo_code_usage
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- transaction_status -- static lookup table (id, name). Public read, no
-- client write (rows are seeded, never app-managed).
-- ---------------------------------------------------------------------
ALTER TABLE public.transaction_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY transaction_status_public_select ON public.transaction_status
  FOR SELECT USING (true);
