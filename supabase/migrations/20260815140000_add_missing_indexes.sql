-- Postgres does not auto-index foreign-key columns, and these are exactly
-- the columns the app filters on most. The one that matters most:
-- expire_stale_ticket_checkouts() (see 20260815130000) runs on every
-- single checkout attempt (validateCheckout, generateTicket) plus every
-- 5 minutes via cron, filtering ticket_checkout by status/expires_at with
-- no supporting index — a full table scan on the purchase hot path whose
-- cost grows with all-time (not active) checkout volume, since the table
-- has no purge job.
CREATE INDEX IF NOT EXISTS idx_ticket_checkout_pending_expiry
  ON public.ticket_checkout (status, expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_transaction_user_id
  ON public.transaction (user_id);

CREATE INDEX IF NOT EXISTS idx_attendance_event_id
  ON public.attendance (event_id);

CREATE INDEX IF NOT EXISTS idx_ticket_type_event_id
  ON public.ticket_type (event_id);

CREATE INDEX IF NOT EXISTS idx_event_occurrence_event_id
  ON public.event_occurrence (event_id);

CREATE INDEX IF NOT EXISTS idx_review_reviewed_id
  ON public.review (reviewed_id);
