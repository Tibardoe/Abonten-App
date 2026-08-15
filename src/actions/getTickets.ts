"use server";

import { createClient } from "@/config/supabase/server";

export async function getTickets(eventId: string) {
  const supabase = await createClient();

  const { data: tickets, error: ticketsError } = await supabase
    .from("ticket_type")
    .select("*")
    .eq("event_id", eventId);

  if (!tickets || ticketsError) {
    console.log(`Error fetching tickets: ${ticketsError?.message}`);

    return {
      status: 500,
      message: "Failed to load tickets. Please try again.",
    };
  }

  return { status: 200, tickets };
}
