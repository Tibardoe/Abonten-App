"use client";

import { getTicketTransfers } from "@/actions/ticketTransfers/getTicketTransfers";
import { answerOrThrow } from "@abonten/core/envelopeFailure";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

export const TICKET_TRANSFERS_KEY = ["ticket-transfers"] as const;

/**
 * The person's offers (sent to them, sent by them and still waiting) and
 * whether they may send. One request shared by the offers panel and every
 * ticket card on the page.
 */
export function useTicketTransfers() {
  return useQuery({
    queryKey: TICKET_TRANSFERS_KEY,
    queryFn: async () => {
      const res = answerOrThrow(await getTicketTransfers());
      return res.status === 200 && "data" in res && res.data ? res.data : null;
    },
    staleTime: 15_000,
  });
}

/** After a move: the offers and the ticket lists both changed. */
export function useRefreshAfterTransfer() {
  const qc = useQueryClient();
  const router = useRouter();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: TICKET_TRANSFERS_KEY });
    void qc.invalidateQueries({ queryKey: ["attending-events"] });
    void qc.invalidateQueries({ queryKey: ["attending-events-counts"] });
    router.refresh();
  }, [qc, router]);
}
