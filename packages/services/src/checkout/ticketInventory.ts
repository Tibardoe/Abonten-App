import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";

// Deliberately NOT a "use server" Server Action: every exported function in
// a "use server" file gets a directly POST-able public endpoint regardless
// of which code actually calls it. These two functions adjust ticket
// inventory with no natural per-call "owner" to authorize against, so they
// must only ever be reachable through the Server Actions that already did
// their own authorization (validateCheckout, generateTicket,
// registerForFreeEvent, cancelUserTicket) — never as an
// independently callable endpoint an attacker could hit directly to drain
// or inflate a ticket type's stock.
//
// Uses the service-role client, not the cookie client: `ticket_type` RLS
// only allows the event's organizer to UPDATE it (ticket_type_organizer_all),
// so the compare-and-swap below returns 0 rows when run as the buyer — which
// is every checkout. The service-role client bypasses RLS; the CAS itself
// (`WHERE quantity = <value just read>`) is still what guarantees no
// oversell. Same "prove identity in the caller, then do the privileged write
// with the service client" pattern as cancelEvent.ts → issueRefundCore.

/**
 * Atomically reserves `requestedQuantity` units of a ticket type by
 * decrementing ticket_type.quantity with a compare-and-swap update
 * (WHERE quantity = <value just read>). If a concurrent request already
 * changed the row, 0 rows are updated and the caller is told someone
 * else won the race — this is what actually protects the final ticket,
 * since two simultaneous requests can never both succeed here.
 * A null quantity means "unlimited" and is never decremented.
 */
export async function reserveTicketQuantity(
  ticketTypeId: string,
  requestedQuantity: number,
) {
  const supabase = getSupabaseServiceClient();

  const { data: ticketType, error: ticketTypeError } = await supabase
    .from("ticket_type")
    .select("quantity")
    .eq("id", ticketTypeId)
    .maybeSingle();

  if (ticketTypeError || !ticketType) {
    logger.error(`Failed fetching ticket type: ${ticketTypeError?.message}`);

    return { status: 404, message: "Ticket type not found" };
  }

  if (ticketType.quantity === null) {
    return { status: 200 };
  }

  if (ticketType.quantity < requestedQuantity) {
    return {
      status: 409,
      message: "This ticket type is sold out.",
    };
  }

  const { data: updated, error: updateError } = await supabase
    .from("ticket_type")
    .update({ quantity: ticketType.quantity - requestedQuantity })
    .eq("id", ticketTypeId)
    .eq("quantity", ticketType.quantity)
    .select("id");

  if (updateError) {
    logger.error(`Failed reserving ticket quantity: ${updateError.message}`);

    return { status: 500, message: "Something went wrong!" };
  }

  if (!updated || updated.length === 0) {
    return {
      status: 409,
      message:
        "This ticket was just claimed by someone else. Please try again.",
    };
  }

  return { status: 200 };
}

const MAX_CAS_ATTEMPTS = 5;

/**
 * Compensating action for reserveTicketQuantity: gives back units that
 * were reserved but never actually issued (e.g. ticket creation failed
 * partway through after the reservation succeeded). Uses the same
 * compare-and-swap update as reserveTicketQuantity, retried on contention:
 * a plain read-then-write here would lose increments when two releases
 * race (both read the same value, both write the same result).
 */
export async function releaseTicketQuantity(
  ticketTypeId: string,
  quantityToRelease: number,
) {
  if (quantityToRelease <= 0) return;

  const supabase = getSupabaseServiceClient();

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const { data: ticketType, error: ticketTypeError } = await supabase
      .from("ticket_type")
      .select("quantity")
      .eq("id", ticketTypeId)
      .maybeSingle();

    if (ticketTypeError || !ticketType || ticketType.quantity === null) {
      return;
    }

    const { data: updated, error: updateError } = await supabase
      .from("ticket_type")
      .update({ quantity: ticketType.quantity + quantityToRelease })
      .eq("id", ticketTypeId)
      .eq("quantity", ticketType.quantity)
      .select("id");

    if (updateError) {
      logger.error(`Failed releasing ticket quantity: ${updateError.message}`);
      return;
    }

    if (updated && updated.length > 0) {
      return;
    }
    // 0 rows updated means another writer changed the row between the read
    // and write above — retry with a fresh read instead of overwriting it.
  }

  logger.error(
    `Failed releasing ${quantityToRelease} unit(s) for ticket type ${ticketTypeId} after ${MAX_CAS_ATTEMPTS} attempts (contention)`,
  );
}
