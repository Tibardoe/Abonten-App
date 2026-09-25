// Cancelling every ticket an order paid for, from a trust context that has
// already been proven (the admin console's finance.refund, which runs on
// the service role). The buyer's own path is cancelUserTicketCore — one
// ticket at a time, scoped to the caller; this does the same work for the
// whole transaction: ticket → cancelled, its attendance → cancelled, the
// checkout row → cancelled once all of its tickets are, the seat back on
// sale, the promo usage released. Checked-in ("used") tickets are kept:
// the person attended.
//
// Idempotent: a ticket is flipped by compare-and-set, so a repeat (a double
// click, a retry after the refund step failed) releases nothing twice.

import { logger } from "@abonten/core/logger";
import { releaseTicketQuantity } from "@abonten/services/checkout/ticketInventory";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import {
  markCheckoutCancelledIfAllTicketsCancelled,
  releasePromoUsageIfEventFullyCancelled,
} from "./cancelUserTicketCore";

type TicketRow = {
  id: string;
  user_id: string;
  status: string;
  ticket_type_id: string;
  ticket_checkout_id: string | null;
  ticket_type: { event_id: string } | null;
};

export async function cancelTicketsForTransactionCore(
  transactionId: string,
): Promise<{ cancelled: number; kept: number }> {
  const service = getSupabaseServiceClient();
  const { data, error } = await service
    .from("ticket")
    .select(
      "id, user_id, status, ticket_type_id, ticket_checkout_id, ticket_type:ticket_type_id(event_id)",
    )
    .eq("transaction_id", transactionId);
  if (error) {
    logger.error(
      `cancelTicketsForTransaction: failed listing tickets for ${transactionId}: ${error.message}`,
    );
    throw new Error(error.message);
  }

  let cancelled = 0;
  let kept = 0;
  for (const ticket of (data ?? []) as unknown as TicketRow[]) {
    if (ticket.status !== "active") {
      kept += 1;
      continue;
    }
    const { data: flipped, error: flipError } = await service
      .from("ticket")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", ticket.id)
      .eq("status", "active")
      .select("id");
    if (flipError) {
      logger.error(
        `cancelTicketsForTransaction: failed cancelling ticket ${ticket.id}: ${flipError.message}`,
      );
      throw new Error(flipError.message);
    }
    if (!flipped || flipped.length === 0) {
      // A gate scan or another caller got there first.
      kept += 1;
      continue;
    }
    cancelled += 1;

    const { error: attendanceError } = await service
      .from("attendance")
      .update({ status: "cancelled" })
      .eq("ticket_id", ticket.id);
    if (attendanceError) {
      logger.error(
        `cancelTicketsForTransaction: failed cancelling attendance for ticket ${ticket.id}: ${attendanceError.message}`,
      );
    }
    if (ticket.ticket_checkout_id) {
      await markCheckoutCancelledIfAllTicketsCancelled(
        service,
        ticket.ticket_checkout_id,
      );
    }
    await releaseTicketQuantity(ticket.ticket_type_id, 1);
    const eventId = ticket.ticket_type?.event_id;
    if (eventId) {
      await releasePromoUsageIfEventFullyCancelled(
        service,
        ticket.user_id,
        eventId,
      );
    }
  }
  return { cancelled, kept };
}
