import type { QueryClient } from "@tanstack/react-query";

// Native counterpart of the web
// `invalidateTicketStatusQueries` + `invalidateEventListQueries` pair
// (apps/web/src/utils/mutationQueryInvalidation.ts). Any change to a user's
// ticket/attendance state — a completed Paystack purchase, a free RSVP, a
// ticket cancellation — ripples through more screens than the mutating hook
// can name individually:
//
//   • ["mobile","tickets"] / ["mobile","ticket"] — My Tickets list + detail
//   • ["mobile","checkout"]                       — the resume-checkout basket
//   • ["mobile","event"] / ["mobile","place"]     — detail screens (attendance,
//                                                   spots-left, sold-out)
//   • ["mobile","attending-event-ids"]            — the "You're going" badge on
//                                                   every discovery card
//   • ["discovery"] / ["explore"]                 — Around You + Explore feeds
//                                                   (EventCard renders
//                                                   attendance_count / capacity
//                                                   straight from the list RPC
//                                                   rows, so a refetch is what
//                                                   moves "12 going / 3 left")
//   • ["mobile","search"]                         — search results (same card)
//   • ["mobile","organizer"]                      — dashboard / attendees /
//                                                   insights / finance
//   • ["reviews","eligibility"]                   — "you can review this" gate
//   • ["profile"]                                 — profile events / reviews tabs
//
// Matching TanStack Query's partial-key semantics, each entry is a key
// *prefix*; passing the short form invalidates every query nested under it.
const TICKET_MUTATION_KEY_PREFIXES: readonly (readonly unknown[])[] = [
  ["mobile", "tickets"],
  ["mobile", "ticket"],
  ["mobile", "checkout"],
  ["mobile", "event"],
  ["mobile", "place"],
  ["mobile", "attending-event-ids"],
  ["mobile", "search"],
  ["mobile", "organizer"],
  ["discovery"],
  ["explore"],
  ["reviews", "eligibility"],
  ["profile"],
];

/**
 * Invalidate every cache family a ticket/attendance mutation can affect.
 * Cheap — TanStack Query only refetches queries that are currently mounted
 * or actively observed.
 */
export function invalidateAfterTicketMutation(queryClient: QueryClient): void {
  for (const queryKey of TICKET_MUTATION_KEY_PREFIXES) {
    queryClient.invalidateQueries({ queryKey: queryKey as unknown[] });
  }
}
