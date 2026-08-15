"use server";

import { createClient } from "@/config/supabase/server";

export default async function getUserAttendingEvents() {
  const supabase = await createClient();

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error(userError?.message);
      return { status: 500, message: "User not logged in" };
    }

    const userId = user.id;

    const { data: tickets, error: ticketsError } = await supabase
      .from("ticket")
      .select(
        `
        *,
        ticket_type:ticket_type_id (
          *,
          event:event_id (
            *,
            occurrences:event_occurrence (*)
          )
        )
      `,
      )
      .eq("user_id", userId);

    if (ticketsError) {
      console.error(
        `Error fetching user attending events:${ticketsError.message}`,
      );

      return { status: 500, message: "Something went wrong" };
    }

    if (!tickets || tickets.length === 0) {
      return { status: 404, message: "No events found!" };
    }

    const ticketsWithEvents = tickets.map((ticket) => ({
      ...ticket,
      event: ticket.ticket_type.event,
    }));

    return { status: 200, data: ticketsWithEvents };
  } catch (error) {
    console.log(error);
  }
}
