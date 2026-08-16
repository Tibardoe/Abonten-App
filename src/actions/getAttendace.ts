"use server";

import { publicSupabase } from "@/config/supabase/publicClient";

export async function getEventAttendanceCount(eventId: string) {
  const supabase = publicSupabase;
  const { data, error } = await supabase
    .from("attendance")
    .select("number_of_tickets")
    .eq("event_id", eventId)
    .eq("status", "attending");

  if (error) {
    return { status: 500, message: error.message };
  }

  const count = (data ?? []).reduce(
    (sum, row) => sum + (row.number_of_tickets ?? 0),
    0,
  );

  return { status: 200, count };
}

/**
 * Attendance counts for many events in a single round trip, instead of one
 * query per event. Returns a map of event_id -> count (missing ids = 0).
 * Only rows still `status = 'attending'` count — a cancelled ticket's
 * attendance row is marked `cancelled` (see cancelUserTicket.ts) and must
 * not keep holding a spot. Sums `number_of_tickets` rather than counting
 * rows, since one attendance row can represent a multi-ticket purchase.
 */
export async function getEventAttendanceCounts(
  eventIds: string[],
): Promise<Record<string, number>> {
  if (eventIds.length === 0) return {};

  const supabase = publicSupabase;
  const { data, error } = await supabase
    .from("attendance")
    .select("event_id, number_of_tickets")
    .eq("status", "attending")
    .in("event_id", eventIds);

  if (error || !data) {
    console.error(`Error fetching attendance counts: ${error?.message}`);
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of data) {
    counts[row.event_id] =
      (counts[row.event_id] ?? 0) + (row.number_of_tickets ?? 0);
  }

  return counts;
}
