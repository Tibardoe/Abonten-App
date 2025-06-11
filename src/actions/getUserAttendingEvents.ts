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
      .select("*, ticket_type:ticket_type_id(*)")
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

    const ticketsWithEvents = await Promise.all(
      tickets.map(async (ticket) => {
        const { data: event, error: eventError } = await supabase
          .from("event")
          .select("*")
          .eq("id", ticket.ticket_type.event_id)
          .single();

        if (eventError) {
          console.log(
            `Failed fetching event for ticket: ${eventError.message}`,
          );

          return { status: 500, message: "Something went wrong!" };
        }

        if (!event) {
          return { status: 404, message: "No event found!" };
        }

        return { ...ticket, event };
      }),
    );

    return { status: 200, data: ticketsWithEvents };
  } catch (error) {
    console.log(error);
  }
}
