import { api } from "@/lib/api";
import type { UpdateEventTicketTypesBody } from "@abonten/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// Native echo of the web ManageEventDetailsSection "Save ticket types"
// button: PUT the new ticket types to
// /api/mobile/organizer/events/:id/ticket-types, which runs the same
// updateEventTicketTypesCore the web updateEventTicketTypes action runs.
// The server replaces them wholesale and rejects (409) once the event has
// its first confirmed ticket.

export type UpdateEventTicketTypesInput = UpdateEventTicketTypesBody & {
  eventId: string;
};

export function useUpdateEventTicketTypes() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, ...body }: UpdateEventTicketTypesInput) =>
      api.organizer.updateEventTicketTypes(eventId, body),
    onSuccess: (res, vars) => {
      if (res.status === 200) {
        qc.invalidateQueries({ queryKey: ["discovery"] });
        qc.invalidateQueries({ queryKey: ["explore"] });
        qc.invalidateQueries({ queryKey: ["mobile", "organizer"] });
        qc.invalidateQueries({
          queryKey: ["mobile", "organizer", "event-insights", vars.eventId],
        });
        qc.invalidateQueries({
          queryKey: ["mobile", "organizer", "event-edit", vars.eventId],
        });
        qc.invalidateQueries({ queryKey: ["mobile", "event", vars.eventId] });
      }
    },
  });
}
