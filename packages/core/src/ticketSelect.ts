/**
 * Shared Supabase select shape for a ticket joined with its ticket type,
 * event, event occurrences, and its own refunds (`refund_parts`, a payment
 * refunded ticket by ticket — read with refundStatus.ticketRefundState). Used by every fetcher that needs to produce
 * a `UserTicketType` (My Events list, the ticket PDF/email attachment) so
 * they can never drift into fetching different shapes of the same ticket.
 *
 * `ticket_type` and `event` are `!inner`: a ticket whose event the reader may
 * not see (staff hid or removed the listing, so the event's access rule,
 * which the ticket type's rule reads through, refuses it) is left out of the
 * result instead of arriving with `ticket_type: null`, which every caller
 * reads straight through (`ticket.ticket_type.event`). On 2026-11-17 the
 * hidden pilot events made My Tickets fail for everyone holding one.
 */
export const TICKET_WITH_EVENT_SELECT = `
  *,
  transaction:transaction_id ( status, refund_requested_at ),
  refund_parts:transaction_refund_ticket (
    refund:refund_id ( status, amount, currency, created_at, tickets:transaction_refund_ticket ( ticket_id ) )
  ),
  ticket_type:ticket_type_id!inner (
    *,
    event:event_id!inner (
      *,
      occurrences:event_occurrence (*)
    )
  )
`;

/**
 * Same shape as TICKET_WITH_EVENT_SELECT, but embeds `transaction` with
 * `!inner` so it can be filtered on (`.gt("transaction.amount", 0)`) — used
 * by getUserTicketRefunds, which only wants cancelled tickets that actually
 * had a paid transaction, not every cancelled ticket (free/fully-discounted
 * cancellations have no transaction at all and aren't a refund).
 */
export const TICKET_REFUND_SELECT = `
  *,
  transaction:transaction_id!inner ( status, refund_requested_at, amount, currency ),
  refund_parts:transaction_refund_ticket (
    refund:refund_id ( status, amount, currency, created_at, tickets:transaction_refund_ticket ( ticket_id ) )
  ),
  ticket_type:ticket_type_id!inner (
    *,
    event:event_id!inner (
      *,
      occurrences:event_occurrence (*)
    )
  )
`;
