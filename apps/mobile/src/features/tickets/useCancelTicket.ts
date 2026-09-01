import { api } from "@/lib/api";
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
      qc.invalidateQueries({ queryKey: ["mobile", "tickets"] });
      qc.invalidateQueries({ queryKey: ["mobile", "ticket"] });
    },
  });
}
