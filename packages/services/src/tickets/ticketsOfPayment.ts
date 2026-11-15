import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

export type PaymentTicket = {
  id: string;
  /** Who holds it now: a ticket sent to a friend is still this payment's. */
  holderId: string;
  status: string;
  ticketTypeId: string;
  checkoutId: string | null;
  eventId: string | null;
};

type Row = {
  id: string;
  user_id: string;
  status: string;
  ticket_type_id: string;
  ticket_checkout_id: string | null;
  ticket_type: { event_id: string } | null;
};

/**
 * Every ticket one payment paid for (every quantity, and every event of a
 * basket paid at once), whoever holds it now. Read with the service role:
 * a ticket the buyer sent to a friend (ticket transfers) is invisible to the
 * buyer's own client, and a refund decided without it could pay back a
 * ticket someone still holds. Callers have already checked the payment is
 * the caller's. `_supabase` is kept for the existing call sites. Null when
 * the read failed.
 */
export async function ticketsOfPayment(
  _supabase: SupabaseClient<Database>,
  transactionId: string,
): Promise<PaymentTicket[] | null> {
  const { data, error } = await getSupabaseServiceClient()
    .from("ticket")
    .select(
      "id, user_id, status, ticket_type_id, ticket_checkout_id, ticket_type:ticket_type_id(event_id)",
    )
    .eq("transaction_id", transactionId);
  if (error) {
    logger.error(
      `Failed listing the tickets of payment ${transactionId}: ${error.message}`,
    );
    return null;
  }
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    holderId: row.user_id,
    status: row.status,
    ticketTypeId: row.ticket_type_id,
    checkoutId: row.ticket_checkout_id,
    eventId: row.ticket_type?.event_id ?? null,
  }));
}
