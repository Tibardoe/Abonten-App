"use server";

import { createClient } from "@/config/supabase/server";

export default async function insertUserAttendance(
  eventId: string,
  quantity?: number,
  ticketTypeId?: string,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.log(`Failed fetching user: ${userError.message}`);

    return {
      status: 500,
      message: "Something went wrong!",
    };
  }

  if (!user) {
    return { status: 401, message: "User not logged in" };
  }

  if (!ticketTypeId) {
    return { status: 400, message: "Missing ticket type" };
  }

  // Attendance records claim to represent a real, issued ticket — verify
  // the caller actually holds one of this type before recording it, so a
  // direct call can't fabricate an "attending" row without ever buying.
  const { count: ticketCount, error: ticketCountError } = await supabase
    .from("ticket")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("ticket_type_id", ticketTypeId)
    .eq("status", "active");

  if (ticketCountError) {
    console.log(
      `Failed verifying ticket ownership: ${ticketCountError.message}`,
    );

    return { status: 500, message: "Something went wrong!" };
  }

  if (!ticketCount || ticketCount < (quantity ?? 1)) {
    return { status: 403, message: "No matching ticket found for this event" };
  }

  const { error: insertError } = await supabase.from("attendance").insert({
    user_id: user.id,
    event_id: eventId,
    ticket_type_id: ticketTypeId,
    status: "attending",
    number_of_tickets: quantity ?? 1,
  });

  if (insertError) {
    console.log(`Failed inserting attendance: ${insertError.message}`);

    return { status: 404, message: "Something went wrong!" };
  }

  return { status: 200, message: "Event registered successfully" };
}
