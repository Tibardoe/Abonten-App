import type { Database } from "./database.types";

// The event row as the organizer's management page loads it:
// `event` + its occurrences + its ticket tiers (see
// apps/web/src/app/(pages)/manage/events/[eventId]/page.tsx).
// Nullable exactly where the ticket_type columns are nullable.
export type ManagedEventTicketType = {
  id: string;
  type: string | null;
  price: number | null;
  /** Places (people) left; a group type sells floor(quantity / admits). */
  quantity: number | null;
  /** People one purchase admits (a Couple: 2). */
  admits?: number | null;
  /** A pass: the shows of the run it covers (docs/architecture/show-passes.md). */
  pass_shows?: number | null;
  currency: string | null;
  available_from?: string | null;
  available_until?: string | null;
  /** What the ticket includes (@abonten/core/ticketTypeNote). */
  description?: string | null;
  /** "open": the buyer chooses the amount (@abonten/core/openAmountTickets). */
  amount_mode?: string | null;
  min_amount?: number | null;
  max_amount?: number | null;
  amount_step?: number | null;
};

export type ManagedEvent = Database["public"]["Tables"]["event"]["Row"] & {
  event_occurrence: { id: string; starts_at: string; ends_at: string }[];
  ticket_type: ManagedEventTicketType[];
  /** Automatic group prices ("10 or more tickets: 10% off"). */
  event_group_discount?: { min_tickets: number; percent_off: number }[] | null;
  /** Group tickets and group prices are switched on for this organizer. */
  group_pricing_enabled?: boolean;
  /** Ticket types whose amount the buyer chooses are switched on. */
  open_amount_enabled?: boolean;
};
