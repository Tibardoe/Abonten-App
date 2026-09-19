import type { Database } from "./database.types";

// The event row as the organizer's management page loads it:
// `event` + its occurrences + its ticket tiers (see
// apps/web/src/app/(pages)/manage/events/[eventId]/page.tsx).
// Nullable exactly where the ticket_type columns are nullable.
export type ManagedEventTicketType = {
  id: string;
  type: string | null;
  price: number | null;
  quantity: number | null;
  currency: string | null;
  available_from?: string | null;
  available_until?: string | null;
};

export type ManagedEvent = Database["public"]["Tables"]["event"]["Row"] & {
  event_occurrence: { id: string; starts_at: string; ends_at: string }[];
  ticket_type: ManagedEventTicketType[];
};
