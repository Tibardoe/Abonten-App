-- Composite indexes supporting keyset pagination (ORDER BY <col> DESC, id
-- DESC, resumed via a PostgREST `.or()` predicate) for the plain-table
-- lists paginated in this change: a user's/organizer's posted events,
-- favorites, tickets (active/cancelled), reviews, transactions, and an
-- event's attendee list. Unlike the events RPCs, these order by a real
-- stored column, so a plain composite index directly supports both the
-- WHERE filter and the ORDER BY/cursor comparison.
--
-- event.organizer_id had no index at all before this (confirmed via
-- pg_indexes) despite being the primary filter for two of these lists.

CREATE INDEX IF NOT EXISTS idx_event_organizer_created
  ON public.event (organizer_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_favorite_user_created
  ON public.favorite (user_id, created_at, event_id);

CREATE INDEX IF NOT EXISTS idx_ticket_user_status_created
  ON public.ticket (user_id, status, created_at, id);

CREATE INDEX IF NOT EXISTS idx_review_reviewed_created
  ON public.review (reviewed_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_transaction_user_created
  ON public.transaction (user_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_transaction_user_txndate
  ON public.transaction (user_id, transaction_date, id);

CREATE INDEX IF NOT EXISTS idx_attendance_event_created
  ON public.attendance (event_id, created_at, id);
