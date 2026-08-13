"use server";

import { createClient } from "@/config/supabase/server";

/**
 * Compensating action for reserveTicketQuantity: gives back units that
 * were reserved but never actually issued (e.g. ticket creation failed
 * partway through after the reservation succeeded).
 */
export default async function releaseTicketQuantity(
  ticketTypeId: string,
  quantityToRelease: number,
) {
  if (quantityToRelease <= 0) return;

  const supabase = await createClient();

  const { data: ticketType, error: ticketTypeError } = await supabase
    .from("ticket_type")
    .select("quantity")
    .eq("id", ticketTypeId)
    .maybeSingle();

  if (ticketTypeError || !ticketType || ticketType.quantity === null) {
    return;
  }

  await supabase
    .from("ticket_type")
    .update({ quantity: ticketType.quantity + quantityToRelease })
    .eq("id", ticketTypeId);
}
