import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import type { FreeRsvpBody } from "@abonten/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// One-click RSVP for a free event. Native echo of the web
// registerForFreeEvent path (AttendingButton). No checkout session — the
// server issues the single free ticket directly.
export function useFreeRsvp(eventId: string | undefined) {
  const qc = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: (body: FreeRsvpBody) => api.checkout.freeRsvp(body),
    onSuccess: (res) => {
      if (res.status !== 200) return;
      qc.invalidateQueries({ queryKey: ["mobile", "tickets"] });
      if (eventId) {
        qc.invalidateQueries({ queryKey: ["mobile", "event", eventId] });
        qc.invalidateQueries({
          queryKey: ["reviews", "eligibility", eventId, userId],
        });
      }
    },
  });
}
