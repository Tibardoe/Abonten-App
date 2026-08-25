"use server";

import { publicSupabase } from "@/config/supabase/publicClient";

/**
 * Uses the get_event_attendance_count RPC rather than reading `attendance`
 * directly: that table's RLS only lets a row's owner or the event's
 * organizer SELECT it, so a direct read via the cookie-free publicSupabase
 * client (auth.uid() = null) always returned zero rows here. The RPC is a
 * narrow SECURITY DEFINER function that returns only the aggregate count,
 * never raw rows — see 20260902120000_add_public_attendance_count_rpcs.sql.
 */
export async function getEventAttendanceCount(eventId: string) {
  const supabase = publicSupabase;
  const { data, error } = await supabase.rpc("get_event_attendance_count", {
    p_event_id: eventId,
  });

  if (error) {
    return { status: 500, message: error.message };
  }

  return { status: 200, count: Number(data ?? 0) };
}

/**
 * Attendance counts for many events in a single round trip, instead of one
 * query per event. Returns a map of event_id -> count (missing ids = 0).
 * Only rows still `status = 'attending'` count — a cancelled ticket's
 * attendance row is marked `cancelled` (see cancelUserTicket.ts) and must
 * not keep holding a spot. Sums `number_of_tickets` rather than counting
 * rows, since one attendance row can represent a multi-ticket purchase.
 * See getEventAttendanceCount above for why this goes through an RPC
 * instead of a direct `attendance` read.
 */
export async function getEventAttendanceCounts(
  eventIds: string[],
): Promise<Record<string, number>> {
  if (eventIds.length === 0) return {};

  const supabase = publicSupabase;
  const { data, error } = await supabase.rpc("get_event_attendance_counts", {
    p_event_ids: eventIds,
  });

  if (error || !data) {
    console.error(`Error fetching attendance counts: ${error?.message}`);
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of data as { event_id: string; attendance_count: number }[]) {
    counts[row.event_id] = Number(row.attendance_count ?? 0);
  }

  return counts;
}
