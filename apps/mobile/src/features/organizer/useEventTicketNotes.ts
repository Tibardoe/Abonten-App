import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";

// What each ticket type of an event includes (ticket_type.description),
// by ticket type id — for the organizer's lists that come from the
// insights read, which carries no notes. A direct read: the organizer (or
// a team member acting for them) may read the event's ticket types, and so
// may anyone once the event is published. Empty when the read fails: a
// missing note never stops the list.

export function useEventTicketNotes(eventId: string) {
  return useQuery({
    queryKey: ["mobile", "organizer", "ticket-notes", eventId],
    enabled: !!eventId,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("ticket_type")
        .select("id, description")
        .eq("event_id", eventId);
      if (error) return {};
      return Object.fromEntries(
        (data ?? [])
          .filter((row) => !!row.description)
          .map((row) => [row.id, row.description as string]),
      );
    },
  });
}
