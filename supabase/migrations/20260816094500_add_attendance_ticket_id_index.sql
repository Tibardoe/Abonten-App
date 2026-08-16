-- cancelUserTicket.ts now filters attendance by ticket_id on every ticket
-- cancellation (attendance.ticket_id is newly populated per-ticket — see
-- insertUserAttendance.ts in the same release). The Supabase performance
-- advisor flagged attendance_ticket_id_fkey as an unindexed foreign key
-- right after this went live; same rationale as idx_attendance_event_id
-- and the other FK indexes added in 20260815140000_add_missing_indexes.
CREATE INDEX IF NOT EXISTS idx_attendance_ticket_id
  ON public.attendance (ticket_id);
