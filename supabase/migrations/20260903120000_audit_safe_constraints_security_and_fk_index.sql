-- Production-quality audit: low-risk integrity, security and indexing fixes.
-- Every change below was checked against live data (0 violations) before applying.
-- Applied to the linked project (sderrexhawjbmsugndcq) via supabase MCP
-- apply_migration; this file is the matching forward migration.

-- 1. Fix malformed search_path on get_event_attendee_contacts.
--    It was `SET search_path TO 'public, auth'` — a single quoted string that
--    Postgres reads as ONE schema literally named "public, auth" (nonexistent).
--    The body is already fully schema-qualified (public.*, auth.*), so an empty
--    search_path is both safe and the current project convention for
--    SECURITY DEFINER functions.
ALTER FUNCTION public.get_event_attendee_contacts(uuid) SET search_path TO '';

-- 2. Safety-net CHECK constraints. These invariants are currently enforced only
--    in application code (Zod schemas / manual checks). Adding them at the DB
--    level closes the gap where a direct PostgREST write or a future code path
--    could violate them. ticket_type.quantity >= 0 in particular is the
--    last-line guard against overselling under concurrent checkout.
ALTER TABLE public.ticket_type
  ADD CONSTRAINT ticket_type_price_nonnegative CHECK (price >= 0) NOT VALID;
ALTER TABLE public.ticket_type VALIDATE CONSTRAINT ticket_type_price_nonnegative;

ALTER TABLE public.ticket_type
  ADD CONSTRAINT ticket_type_quantity_nonnegative CHECK (quantity >= 0) NOT VALID;
ALTER TABLE public.ticket_type VALIDATE CONSTRAINT ticket_type_quantity_nonnegative;

ALTER TABLE public.promo_code
  ADD CONSTRAINT promo_code_discount_percentage_range
  CHECK (
    discount_percentage IS NULL
    OR (discount_percentage >= 0 AND discount_percentage <= 100)
  ) NOT VALID;
ALTER TABLE public.promo_code VALIDATE CONSTRAINT promo_code_discount_percentage_range;

-- 3. Least privilege: the anonymous role has no legitimate need to hold EXECUTE
--    on these organizer-only / state-mutating RPCs. Each still performs its own
--    auth.uid() ownership check; this simply removes an unused grant that the
--    Supabase security advisor flags (lint 0028).
REVOKE EXECUTE ON FUNCTION public.cancel_event_and_release_tickets(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_event_cancellation_impact(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.approve_place_claim(uuid, uuid) FROM anon;

-- 4. Covering index for the attendance -> ticket_type foreign key. attendance
--    grows one row per registration, is joined to ticket_type in the event
--    analytics RPCs, and an unindexed FK also slows ticket_type deletes/updates.
CREATE INDEX IF NOT EXISTS idx_attendance_ticket_type_id
  ON public.attendance (ticket_type_id);
