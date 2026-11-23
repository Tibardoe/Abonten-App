import { api } from "@/lib/api";
import { settleEnvelope } from "@/lib/envelope";
import {
  isOpenAmountType,
  openAmountPaidOf,
} from "@abonten/core/openAmountTickets";
import type { UserTicketType } from "@abonten/types/ticketType";
import { useQuery } from "@tanstack/react-query";

/**
 * The amount paid for a ticket whose amount the buyer chose (open-amount
 * tickets), for the person holding it. The buyer reads it from their own
 * checkout line (`openAmountPaidOf`); a ticket someone sent them was bought
 * on the sender's line, which their session cannot read, so the server
 * reads it for the holder (GET /api/mobile/tickets/:id/paid-amount). null
 * for a fixed-price ticket, and while that answer is on its way.
 */
export function useHeldTicketPaidAmount(
  ticket: UserTicketType | undefined,
): { amount: number; currency: string } | null {
  const own = ticket ? openAmountPaidOf(ticket) : null;
  const needsServer =
    !!ticket && !own && isOpenAmountType(ticket.ticket_type ?? null);
  const query = useQuery({
    queryKey: ["mobile", "ticket", ticket?.id, "paid-amount"],
    enabled: needsServer,
    // What was paid does not change.
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () =>
      settleEnvelope(await api.tickets.paidAmount(ticket?.id ?? "")),
  });
  if (own) return own;
  if (!needsServer) return null;
  return query.data?.status === 200 ? query.data.data.paidAmount : null;
}
