"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";

export default async function getEventTitle(eventId: string) {
  const supabase = await createClient();

  const { data: eventData, error: eventTitleError } = await supabase
    .from("event")
    .select("title, starts_at, ends_at")
    .eq("id", eventId)
    .single();

  if (eventTitleError) {
    logger.error(`Error fetching event title:${eventTitleError.message}`);

    return { status: 500, message: "Error fetching event title" };
  }

  if (!eventData) {
    return { status: 404, message: "No event found!" };
  }

  return { status: 200, data: eventData };
}
