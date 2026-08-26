"use server";

import { createClient } from "@/config/supabase/server";

export default async function getEventDateAnalytics(
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

  // Single-date/range events never populate event_occurrence at all (see
  // postEvent.ts), which is the common case — skip the RPC round trip
  // entirely rather than calling it just to get an empty result back.
  const { count: occurrenceCount, error: occurrenceCountError } = await supabase
    .from("event_occurrence")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);

  if (occurrenceCountError) {
    console.error("Supabase error:", occurrenceCountError.message);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!occurrenceCount) {
    return { status: 200, data: [], hasOccurrences: false };
  }

  const { data, error } = await supabase.rpc("get_event_date_analytics", {
    p_event_id: eventId,
    p_start_date: startDate ?? undefined,
    p_end_date: endDate ?? undefined,
  });

  if (error) {
    console.error("Supabase error:", error.message);
    return { status: 500, message: "Something went wrong!" };
  }

  return {
    status: 200,
    // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
    data: (data ?? []) as any[],
    hasOccurrences: true,
  };
}
