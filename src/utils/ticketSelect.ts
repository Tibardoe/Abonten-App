/**
 * Shared Supabase select shape for a ticket joined with its ticket type,
 * event, and event occurrences. Used by every fetcher that needs to produce
 * a `UserTicketType` (My Events list, the ticket PDF/email attachment) so
 * they can never drift into fetching different shapes of the same ticket.
 */
export const TICKET_WITH_EVENT_SELECT = `
  *,
  ticket_type:ticket_type_id (
    *,
    event:event_id (
      *,
      occurrences:event_occurrence (*)
    )
  )
`;
