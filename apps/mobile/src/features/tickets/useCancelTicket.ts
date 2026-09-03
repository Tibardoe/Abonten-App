import { api } from "@/lib/api";
import { invalidateAfterTicketMutation } from "@/lib/ticketMutationInvalidation";
import type { CancelTicketBody } from "@abonten/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// Native echo of the web CancelUserTicketBtn. A paid ticket passes its
// transactionId so the server can gate the partial refund; a free ticket
// passes null. Server never throws — callers branch on `status`.
export function useCancelTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CancelTicketBody) => api.tickets.cancel(body),
    onSuccess: (res) => {
      if (res.status !== 200) return;
      // Cancelling frees the spot back: the discovery/explore cards, the
      // "You're going" badge, event detail and the organizer's attendee
      // list all need to reflect it — same fan-out as a purchase.
      invalidateAfterTicketMutation(qc);
    },
  });
}
