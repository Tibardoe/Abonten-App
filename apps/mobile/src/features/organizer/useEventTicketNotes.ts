import { supabase } from "@/lib/supabase";
import {
  type OpenAmountRange,
  openAmountRangeOf,
} from "@abonten/core/openAmountTickets";
import { useQuery } from "@tanstack/react-query";

// What each ticket type of an event includes (ticket_type.description) and,
// for a type whose amount the buyer chooses, its range, by ticket type id —
// for the organizer's lists that come from the insights read, which carries
// neither (an open type's price there is its lowest amount alone). A direct
// read: the organizer (or a team member acting for them) may read the
// event's ticket types, and so may anyone once the event is published.
// Empty when the read fails: a missing note never stops the list, and the
// price then shows as the insights read has it.

export type EventTicketTypeExtras = {
  notes: Record<string, string>;
  openRanges: Record<string, OpenAmountRange>;
};

export function useEventTicketNotes(eventId: string) {
  return useQuery({
    queryKey: ["mobile", "organizer", "ticket-type-extras", eventId],
    enabled: !!eventId,
    staleTime: 60_000,
    queryFn: async (): Promise<EventTicketTypeExtras> => {
      const { data, error } = await supabase
        .from("ticket_type")
        .select(
          "id, description, amount_mode, min_amount, max_amount, amount_step",
        )
        .eq("event_id", eventId);
      if (error) return { notes: {}, openRanges: {} };
      const notes: Record<string, string> = {};
      const openRanges: Record<string, OpenAmountRange> = {};
      for (const row of data ?? []) {
        if (row.description) notes[row.id] = row.description;
        const range = openAmountRangeOf(row);
        if (range) openRanges[row.id] = range;
      }
      return { notes, openRanges };
    },
  });
}
