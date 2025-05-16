"use server";

import { createClient } from "@/config/supabase/server";

export default async function getEventTitle(eventId: string) {
  const supabase = await createClient();

  const { data: eventTitle, error: eventTitleError } = await supabase
    .from("event")
    .select("title")
    .eq("id", eventId)
    .single();

  if (eventTitleError) {
    console.log(`Error fetching event title:${eventTitleError.message}`);

    return { status: 500, message: "Error fetching event title" };
  }

  if (!eventTitle) {
    return { status: 404, message: "No event found!" };
  }

  return { status: 200, eventTitle };
}
