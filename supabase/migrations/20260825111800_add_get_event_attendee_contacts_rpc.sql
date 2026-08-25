-- Fixes a pre-existing (not caused by the RLS migration) bug in
-- getAttendanceList.ts: it tried to PostgREST-embed auth.users directly
-- (`auth:id(email, phone)`), which was never actually possible -- auth.users
-- has zero GRANTs for anon/authenticated (correctly locked down), and the
-- embed's join column ("id", the attendance table's own PK) wasn't even a
-- real foreign key. AttendanceListView.tsx expects attendee.auth.email/
-- .phone to show each attendee's real account contact info to the
-- organizer, so this needs a real, deliberate data path rather than
-- widening auth.users' grants.
--
-- SECURITY DEFINER, matching get_auth_user_id_by_phone's existing pattern
-- for reading auth.users. Re-verifies the caller actually organizes
-- p_event_id before returning anything -- same ownership check as the
-- attendance_organizer_select RLS policy, defense-in-depth since this
-- function bypasses RLS by nature.
CREATE OR REPLACE FUNCTION public.get_event_attendee_contacts(p_event_id uuid)
RETURNS TABLE (user_id uuid, email text, phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public, auth'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.event e WHERE e.id = p_event_id AND e.organizer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to view attendees for this event';
  END IF;

  RETURN QUERY
  SELECT DISTINCT u.id, u.email::text, u.phone::text
  FROM public.attendance a
  JOIN auth.users u ON u.id = a.user_id
  WHERE a.event_id = p_event_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_event_attendee_contacts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_attendee_contacts(uuid) TO authenticated;
