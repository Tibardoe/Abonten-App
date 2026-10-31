import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentTicket = {
  id: string;
  status: string;
  ticketTypeId: string;
  checkoutId: string | null;
  eventId: string | null;
};

type Row = {
  id: string;
  status: string;
  ticket_type_id: string;
  ticket_checkout_id: string | null;
  ticket_type: { event_id: string } | null;
};

/**
 * Every ticket one payment paid for (every quantity, and every event of a
 * basket paid at once), read with the buyer's own client: they are all the
 * buyer's. Null when the read failed.
 */
export async function ticketsOfPayment(
  supabase: SupabaseClient<Database>,
  transactionId: string,
): Promise<PaymentTicket[] | null> {
  const { data, error } = await supabase
    .from("ticket")
    .select(
      "id, status, ticket_type_id, ticket_checkout_id, ticket_type:ticket_type_id(event_id)",
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
    status: row.status,
    ticketTypeId: row.ticket_type_id,
    checkoutId: row.ticket_checkout_id,
    eventId: row.ticket_type?.event_id ?? null,
  }));
}
