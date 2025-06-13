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

    throw new Error("Something went wrong");
  }

  return { status: 200, tickets };
}
