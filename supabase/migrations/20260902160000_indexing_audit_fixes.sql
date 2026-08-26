-- Evidence-driven indexing audit follow-up. Every addition below is backed by
-- a confirmed query site in src/actions/ (not a guess); every removal is a
-- structural leftmost-prefix duplicate of an existing composite index, so it
-- can never serve a query the composite index doesn't already serve.

-- ── Missing indexes ─────────────────────────────────────────────────────

-- The core purchase flow (validateCheckout -> createPaymentAttempt /
-- checkoutPaymentPreparation -> generateTicket -> cancelTicketCheckoutSession
-- -> getTicketCheckout) filters ticket_checkout by checkout_session_id at
-- every step, and no index covered it at all (confirmed via pg_indexes) --
-- every one of those was a sequential scan on a high-write table.
CREATE INDEX IF NOT EXISTS idx_ticket_checkout_session_id
  ON public.ticket_checkout (checkout_session_id);

-- getUserEventReviews.ts / getUserPlaceReviews.ts do
-- .eq("reviewer_id", user.id).order("created_at desc").order("id desc") for
-- keyset pagination ("my reviews"), mirroring the existing
-- idx_event_review_event_id / idx_place_review_place_id shape, but nothing
-- covered reviewer_id as a leading column (only the (event_id/place_id,
-- reviewer_id) uniqueness constraint exists, which doesn't help this lookup).
CREATE INDEX IF NOT EXISTS idx_event_review_reviewer_created
  ON public.event_review (reviewer_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_place_review_reviewer_created
  ON public.place_review (reviewer_id, created_at, id);

-- getReviewDraft.ts's "already reviewed this organizer" eligibility check
-- filters review by (reviewer_id, reviewed_id); only reviewed_id was indexed.
CREATE INDEX IF NOT EXISTS idx_review_reviewer_reviewed
  ON public.review (reviewer_id, reviewed_id);

-- getUserHighlights.ts filters highlight by user_id (no ordering) with a cap
-- of 200 rows; highlight had no index beyond its primary key (id).
CREATE INDEX IF NOT EXISTS idx_highlight_user_id
  ON public.highlight (user_id);

-- ── Redundant indexes (leftmost-prefix duplicates) ─────────────────────
-- Each dropped index's leading column(s) are an exact prefix of a composite
-- index already on the same table, so btree leftmost-prefix matching means
-- the composite index already serves every query the single-column index
-- could. Removing them cuts write-path overhead on ticket/transaction/
-- attendance/review, all high-write tables, with no read-path loss.

-- Superseded by idx_ticket_user_status_created (user_id, status, created_at, id)
DROP INDEX IF EXISTS public.idx_ticket_user_id;

-- Superseded by idx_transaction_user_created (user_id, created_at, id) and
-- idx_transaction_user_txndate (user_id, transaction_date, id)
DROP INDEX IF EXISTS public.idx_transaction_user_id;

-- Superseded by idx_attendance_event_created (event_id, created_at, id)
DROP INDEX IF EXISTS public.idx_attendance_event_id;

-- Superseded by idx_review_reviewed_created (reviewed_id, created_at, id)
DROP INDEX IF EXISTS public.idx_review_reviewed_id;

-- NOTE: payment_attempt(payment_method_id, user_id) also carries 5 FK
-- constraints (one to the partitioned parent payment_method, four more
-- individually to payment_method_p0..p3) that look like redundant write-path
-- overhead. Deliberately NOT touched here: attempting to drop the four
-- per-partition ones failed with "cannot drop inherited constraint of
-- relation payment_attempt" even though payment_attempt itself is not
-- partitioned (pg_constraint shows fkey1/2/3 carrying conparentid pointing
-- at fkey's constraint oid) -- a constraint-inheritance relationship this
-- audit doesn't fully understand yet. Flagged for separate investigation,
-- not fixed as a side effect of an indexing migration.
