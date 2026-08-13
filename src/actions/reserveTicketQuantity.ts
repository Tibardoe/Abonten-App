"use server";

import { createClient } from "@/config/supabase/server";

/**
 * Atomically reserves `requestedQuantity` units of a ticket type by
 * decrementing ticket_type.quantity with a compare-and-swap update
 * (WHERE quantity = <value just read>). If a concurrent request already
 * changed the row, 0 rows are updated and the caller is told someone
 * else won the race — this is what actually protects the final ticket,
 * since two simultaneous requests can never both succeed here.
 * A null quantity means "unlimited" and is never decremented.
 */
export default async function reserveTicketQuantity(
  ticketTypeId: string,
  requestedQuantity: number,
) {
  const supabase = await createClient();

  const { data: ticketType, error: ticketTypeError } = await supabase
    .from("ticket_type")
    .select("quantity")
    .eq("id", ticketTypeId)
    .maybeSingle();

  if (ticketTypeError || !ticketType) {
    console.log(`Failed fetching ticket type: ${ticketTypeError?.message}`);

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
    console.log(`Failed reserving ticket quantity: ${updateError.message}`);

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
