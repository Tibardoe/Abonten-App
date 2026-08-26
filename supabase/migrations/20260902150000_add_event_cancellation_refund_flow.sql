-- Event cancellation -> attendee notification -> ticket/refund state flow.
--
-- Before this migration, cancelEvent.ts only flipped event.status to
-- 'canceled' -- no ticket, attendance, ticket_checkout, or notification row
-- was ever touched, and no refund was ever triggered for organizer-initiated
-- cancellation (only the attendee-initiated cancelUserTicket.ts path
-- refunds, via issueRefund.ts -> Paystack /refund -> webhook confirmation).
--
-- Two SECURITY DEFINER RPCs, no new tables/columns:
--
-- 1. get_event_cancellation_impact -- read-only. Lets the organizer's
--    confirmation dialog show server-verified counts (not client
--    assumptions) before they confirm. Must be SECURITY DEFINER because
--    ticket/attendance RLS is scoped to the ticket holder's own user_id, not
--    the organizer -- an organizer's own session can't read other users'
--    ticket rows directly, even for their own event.
--
-- 2. cancel_event_and_release_tickets -- the atomic operation. In one
--    statement it: (a) flips event.status, gated on current status so a
--    second/concurrent call always fails cleanly instead of re-running any
--    side effect (this IS the idempotency guard -- no separate lock needed,
--    Postgres serializes concurrent UPDATEs on the same row); (b) cancels
--    every active/used ticket, attendance row, and paid ticket_checkout row
--    for the event; (c) writes one notification per affected attendee
--    (not per ticket) with copy branching on whether they had a paid ticket.
--    The notification insert deliberately happens INSIDE this SECURITY
--    DEFINER function rather than via a later client-side createNotification
--    call, because the `notification` table has no INSERT RLS policy at all
--    (see 20260825105625_enable_rls_social_batch4.sql -- owner-only SELECT/
--    UPDATE, comment explicitly says inserts are meant to be system-
--    generated) -- a normal session client, even the organizer's own,
--    cannot insert a notification for a different user (the attendee).
--    Routing it through this SECURITY DEFINER function is the same solution
--    record_organizer_earning/approve_place_claim already use for the same
--    class of problem.
--
--    The actual Paystack refund call is deliberately NOT done here -- an
--    HTTP call can't be part of a Postgres transaction. This function
--    returns the deduplicated list of (transaction_id, attendee_user_id,
--    paystack_reference, amount) that need a real refund; the calling
--    Server Action (cancelEvent.ts) drives issueRefund.ts (existing,
--    already idempotent) over that list afterward, and uses
--    attendee_user_id to send the cancellation email to each affected
--    paying attendee. If the refund step partially fails, it's safely
--    retryable: issueRefund.ts checks transaction.status before doing
--    anything, so calling it again is a no-op or a legitimate retry, never
--    a duplicate refund.

CREATE OR REPLACE FUNCTION public.get_event_cancellation_impact(p_event_id uuid)
RETURNS TABLE (
  paid_ticket_count   integer,
  free_ticket_count   integer,
  attendee_count      integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owns_event boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.event
     WHERE id = p_event_id AND organizer_id = auth.uid()
  ) INTO v_owns_event;

  IF NOT v_owns_event THEN
    RAISE EXCEPTION 'Event not found or not owned by caller';
  END IF;

  RETURN QUERY
  SELECT
    count(*) FILTER (WHERE t.transaction_id IS NOT NULL AND tr.amount > 0)::integer,
    count(*) FILTER (WHERE t.transaction_id IS NULL OR tr.amount IS NULL OR tr.amount = 0)::integer,
    count(DISTINCT t.user_id)::integer
  FROM public.ticket t
  JOIN public.ticket_type tt ON tt.id = t.ticket_type_id
  LEFT JOIN public.transaction tr ON tr.id = t.transaction_id
  WHERE tt.event_id = p_event_id
    AND t.status IN ('active', 'used');
END;
$$;

REVOKE ALL ON FUNCTION public.get_event_cancellation_impact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_cancellation_impact(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_event_and_release_tickets(p_event_id uuid)
RETURNS TABLE (
  refund_transaction_id uuid,
  attendee_user_id       uuid,
  paystack_reference     text,
  transaction_amount     numeric,
  transaction_currency   varchar,
  event_title            text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_id uuid;
  v_event_title text;
  v_current_status text;
BEGIN
  UPDATE public.event
     SET status = 'canceled'
   WHERE id = p_event_id
     AND organizer_id = auth.uid()
     AND status IN ('draft', 'published')
  RETURNING id, title INTO v_event_id, v_event_title;

  IF v_event_id IS NULL THEN
    SELECT status INTO v_current_status
      FROM public.event
     WHERE id = p_event_id AND organizer_id = auth.uid();

    IF v_current_status IS NULL THEN
      RAISE EXCEPTION 'Event not found or not owned by caller';
    ELSIF v_current_status = 'canceled' THEN
      RAISE EXCEPTION 'Event is already cancelled';
    ELSE
      RAISE EXCEPTION 'Event cannot be cancelled from its current status';
    END IF;
  END IF;

  RETURN QUERY
  WITH cancelled_tickets AS (
    UPDATE public.ticket t
       SET status = 'cancelled', updated_at = now()
      FROM public.ticket_type tt
     WHERE t.ticket_type_id = tt.id
       AND tt.event_id = v_event_id
       AND t.status IN ('active', 'used')
    RETURNING t.id AS ticket_id, t.user_id, t.transaction_id
  ),
  cancel_attendance AS (
    UPDATE public.attendance
       SET status = 'cancelled'
     WHERE event_id = v_event_id
       AND status = 'attending'
    RETURNING id
  ),
  cancel_checkouts AS (
    UPDATE public.ticket_checkout
       SET status = 'cancelled', updated_at = now()
     WHERE event_id = v_event_id
       AND status = 'paid'
    RETURNING id
  ),
  refundable AS (
    SELECT
      ct.user_id,
      ct.transaction_id,
      tr.amount,
      tr.currency,
      tr.paystack_reference
    FROM cancelled_tickets ct
    LEFT JOIN public.transaction tr ON tr.id = ct.transaction_id
  ),
  notify AS (
    INSERT INTO public.notification (user_id, type, title, body, link)
    SELECT DISTINCT ON (r.user_id)
      r.user_id,
      'event_cancelled',
      'Event cancelled',
      CASE
        WHEN r.amount > 0 THEN format(
          'The organizer has cancelled %s. Your ticket is no longer valid. A refund will be issued to the payment method used for your ticket.',
          v_event_title
        )
        ELSE format(
          'The organizer has cancelled %s. Your registration has been cancelled.',
          v_event_title
        )
      END,
      CASE WHEN r.amount > 0 THEN '/manage/my-events?tab=refunds' ELSE '/manage/my-events?tab=cancelled' END
    FROM refundable r
    ORDER BY r.user_id, (r.amount > 0) DESC NULLS LAST
    RETURNING id
  )
  SELECT DISTINCT
    r.transaction_id, r.user_id, r.paystack_reference, r.amount, r.currency, v_event_title
    FROM refundable r
   WHERE r.transaction_id IS NOT NULL AND r.amount > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_event_and_release_tickets(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_event_and_release_tickets(uuid) TO authenticated;
