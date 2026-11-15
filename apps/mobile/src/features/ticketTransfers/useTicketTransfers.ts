import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import { settleEnvelope } from "@/lib/envelope";
import type { SendTicketBody } from "@abonten/api-client";
import type { SendTicketTarget } from "@abonten/types/ticketTransferType";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Send a ticket to a friend for the app (docs/architecture/ticket-
// transfers.md). Everything goes through /api/mobile/ticket-transfers (the
// tables are service-role only). Keys carry the signed-in user, and none
// is in the persisted-query allowlist: an offer moves a ticket, so it is
// never shown from a stale cache file.

export const TICKET_TRANSFERS_KEY = ["mobile", "ticket-transfers"] as const;

function useUserId(): string | null {
  const { session } = useSession();
  return session?.user.id ?? null;
}

/** Offers to the person, their own open offers, and whether they may send. */
export function useTicketTransfers() {
  const userId = useUserId();
  return useQuery({
    queryKey: [...TICKET_TRANSFERS_KEY, "list", userId],
    enabled: !!userId,
    queryFn: async () => settleEnvelope(await api.ticketTransfers.list()),
    staleTime: 15_000,
  });
}

/** Whether one ticket can be sent now, and why not (organizer, moves). */
export function useTicketTransferState(ticketId: string, enabled: boolean) {
  const userId = useUserId();
  return useQuery({
    queryKey: [...TICKET_TRANSFERS_KEY, "state", userId, ticketId],
    enabled: !!userId && enabled,
    queryFn: async () =>
      settleEnvelope(await api.ticketTransfers.state(ticketId)),
    staleTime: 15_000,
  });
}

/** After any move: the offers and every ticket list changed. */
export function useInvalidateAfterTransfer() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: TICKET_TRANSFERS_KEY });
    void qc.invalidateQueries({ queryKey: ["mobile", "tickets"] });
    void qc.invalidateQueries({ queryKey: ["mobile", "ticket"] });
  };
}

export function useFindTicketRecipient() {
  return useMutation({
    mutationFn: (target: SendTicketTarget) =>
      api.ticketTransfers.recipient(target),
  });
}

export function useSendTicket() {
  const invalidate = useInvalidateAfterTransfer();
  return useMutation({
    mutationFn: (body: SendTicketBody) => api.ticketTransfers.send(body),
    onSuccess: (res) => {
      if (res.status === 200) invalidate();
    },
  });
}

export function useAnswerTicketTransfer() {
  const invalidate = useInvalidateAfterTransfer();
  return useMutation({
    mutationFn: ({
      transferId,
      action,
    }: {
      transferId: string;
      action: "accept" | "decline" | "cancel";
    }): Promise<{ status: number; message?: string }> =>
      action === "accept"
        ? api.ticketTransfers.accept(transferId)
        : action === "decline"
          ? api.ticketTransfers.decline(transferId)
          : api.ticketTransfers.cancel(transferId),
    onSettled: () => invalidate(),
  });
}
