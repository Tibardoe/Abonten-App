import { api } from "@/lib/api";
import type { UpdateTicketTypeNotesBody } from "@abonten/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// What each ticket type includes (its note), saved on its own through
// PUT /api/mobile/organizer/events/:id/ticket-types/notes — the same
// updateTicketTypeNotesCore the web updateTicketTypeNotes action runs.
// Allowed after the first sale, when the rest of the ticket editor is
// locked: a note changes no money.

export type UpdateTicketTypeNotesInput = UpdateTicketTypeNotesBody & {
  eventId: string;
};

export function useUpdateTicketTypeNotes() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, ...body }: UpdateTicketTypeNotesInput) =>
      api.organizer.updateTicketTypeNotes(eventId, body),
    onSuccess: (res, vars) => {
      if (res.status === 200) {
        qc.invalidateQueries({
          queryKey: ["mobile", "organizer", "event-edit", vars.eventId],
        });
        qc.invalidateQueries({ queryKey: ["mobile", "event", vars.eventId] });
        qc.invalidateQueries({ queryKey: ["mobile", "organizer"] });
      }
    },
  });
}
