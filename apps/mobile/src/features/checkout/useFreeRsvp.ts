import { api } from "@/lib/api";
import { invalidateAfterTicketMutation } from "@/lib/ticketMutationInvalidation";
import type { FreeRsvpBody } from "@abonten/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// One-click RSVP for a free event. Native echo of the web
// registerForFreeEvent path (AttendingButton). No checkout session — the
// server issues the single free ticket directly.
export function useFreeRsvp(_eventId?: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (body: FreeRsvpBody) => api.checkout.freeRsvp(body),
    onSuccess: (res) => {
      if (res.status !== 200) return;
      // An RSVP consumes a spot and bumps the attendance count shown on the
      // discovery/explore cards, flips the "You're going" badge, and feeds
      // the organizer's attendee list — same fan-out as a paid purchase.
      invalidateAfterTicketMutation(qc);
    },
  });
}
