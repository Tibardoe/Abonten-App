"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";

export default async function getEventTicketTypeAnalytics(
  eventId: string,
  startDate?: string | null,
  endDate?: string | null,
) {
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

  const { data, error } = await supabase.rpc(
    "get_event_ticket_type_analytics",
    {
      p_event_id: eventId,
      p_start_date: startDate ?? undefined,
      p_end_date: endDate ?? undefined,
    },
  );

  if (error) {
    logger.error("Supabase error:", error.message);
    return { status: 500, message: "Something went wrong!" };
  }

  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
  return { status: 200, data: (data ?? []) as any[] };
}
