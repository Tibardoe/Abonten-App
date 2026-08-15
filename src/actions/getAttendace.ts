"use server";

import { publicSupabase } from "@/config/supabase/publicClient";

export async function getEventAttendanceCount(eventId: string) {
  const supabase = publicSupabase;
  const { count, error } = await supabase
    .from("attendance")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);

  if (error) {
    return { status: 500, message: error.message };
  }

  return { status: 200, count: count };
}

/**
 * Attendance counts for many events in a single round trip, instead of one
 * query per event. Returns a map of event_id -> count (missing ids = 0).
 */
export async function getEventAttendanceCounts(
  eventIds: string[],
): Promise<Record<string, number>> {
  if (eventIds.length === 0) return {};

  const supabase = publicSupabase;
  const { data, error } = await supabase
    .from("attendance")
    .select("event_id")
    .in("event_id", eventIds);

  if (error || !data) {
    console.error(`Error fetching attendance counts: ${error?.message}`);
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of data) {
    counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
  }

  return counts;
}
