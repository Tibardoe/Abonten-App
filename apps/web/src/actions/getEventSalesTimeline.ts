"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";

export default async function getEventSalesTimeline(eventId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id")
    .eq("id", eventId)
    .eq("organizer_id", user.id)
    .maybeSingle();

  if (eventError || !event) {
    return { status: 403, message: "Not authorized to view this event" };
  }

  const { data, error } = await supabase.rpc("get_event_sales_timeline", {
    p_event_id: eventId,
  });

  if (error) {
    logger.error("Supabase error:", error.message);
    return { status: 500, message: "Something went wrong!" };
  }

  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
  return { status: 200, data: (data ?? []) as any[] };
}
