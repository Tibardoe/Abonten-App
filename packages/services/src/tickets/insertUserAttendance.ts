import { logger } from "@abonten/core/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Records one `attendance` row per issued ticket for `userId` on `eventId`.
 * The caller has already resolved and authorised the user; this re-verifies
 * that the user actually holds every `ticketIds` entry (active, of the given
 * ticket type) before writing, so a direct call cannot fabricate an
 * "attending" row without a real purchase.
 *
 * One row per ticket (not one aggregate per checkout line) so a single
 * ticket's later cancellation can target exactly one row via `ticket_id`.
 */
export async function insertUserAttendanceCore(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  ticketTypeId: string,
  ticketIds: string[],
): Promise<{ status: number; message?: string }> {
  if (!ticketTypeId || ticketIds.length === 0) {
    return { status: 400, message: "Missing ticket type" };
  }

  const { data: ownedTickets, error: ticketCountError } = await supabase
    .from("ticket")
    .select("id")
    .eq("user_id", userId)
    .eq("ticket_type_id", ticketTypeId)
    .eq("status", "active")
    .in("id", ticketIds);

  if (ticketCountError) {
    logger.error(
      `Failed verifying ticket ownership: ${ticketCountError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  if (!ownedTickets || ownedTickets.length < ticketIds.length) {
    return { status: 403, message: "No matching ticket found for this event" };
  }

  const { error: insertError } = await supabase.from("attendance").insert(
    ticketIds.map((ticketId) => ({
      user_id: userId,
      event_id: eventId,
      ticket_type_id: ticketTypeId,
      ticket_id: ticketId,
      status: "attending",
      number_of_tickets: 1,
    })),
  );

  if (insertError) {
    logger.error(`Failed inserting attendance: ${insertError.message}`);
    return { status: 404, message: "Something went wrong!" };
  }

  return { status: 200, message: "Event registered successfully" };
}
