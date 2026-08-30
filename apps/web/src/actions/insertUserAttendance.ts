"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import type { AuthOverride } from "@abonten/types/authOverrideType";

export default async function insertUserAttendance(
  eventId: string,
  ticketTypeId: string,
  ticketIds: string[],
  authOverride?: AuthOverride,
) {
  const supabase = authOverride?.supabase ?? (await createClient());

  let userId: string;

  if (authOverride) {
    userId = authOverride.userId;
  } else {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      logger.error(`Failed fetching user: ${userError.message}`);

      return {
        status: 500,
        message: "Something went wrong!",
      };
    }

    if (!user) {
      return { status: 401, message: "User not logged in" };
    }

    userId = user.id;
  }

  if (!ticketTypeId || ticketIds.length === 0) {
    return { status: 400, message: "Missing ticket type" };
  }

  // Attendance records claim to represent a real, issued ticket — verify the
  // caller actually holds every ticket id passed in before recording it, so
  // a direct call can't fabricate an "attending" row without ever buying.
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

  // One attendance row per ticket (not one aggregated row per checkout line)
  // so a single ticket's cancellation can later target exactly one row via
  // ticket_id, instead of needing to guess how to split an aggregate count.
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
