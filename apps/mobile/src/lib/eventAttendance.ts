import { supabase } from "@/lib/supabase";

// Native mirror of the web `getEventAttendanceCounts` action
// (apps/web/src/actions/getAttendace.ts).
//
// `get_nearby_events`, `get_similar_events` and raw `event` table reads do
// NOT carry an attendance figure (only `get_filtered_events` does), so every
// EventCard fed from those sources rendered "0 going" and full spots-left —
// it could never show "few left" or "Sold out". The web Server Actions
// backfill it with one batched RPC call per page; the mobile discovery hooks
// were missing that step. `get_event_attendance_counts` is an anon-safe
// SECURITY DEFINER RPC that returns only the aggregate (summing
// `number_of_tickets`, `status = 'attending'` only), never raw rows.

/**
 * event_id -> current attending headcount. One round trip for many events;
 * ids not present in the result map to 0. Never throws — a failed lookup
 * degrades to "no counts" (same as the card's prior behaviour) rather than
 * breaking the list.
 */
export async function fetchEventAttendanceCounts(
  eventIds: readonly string[],
): Promise<Record<string, number>> {
  const ids = Array.from(new Set(eventIds.filter(Boolean)));
  if (ids.length === 0) return {};

  const { data, error } = await supabase.rpc("get_event_attendance_counts", {
    p_event_ids: ids,
  });

  if (error || !data) return {};

  const counts: Record<string, number> = {};
  for (const row of data as { event_id: string; attendance_count: number }[]) {
    counts[row.event_id] = Number(row.attendance_count ?? 0);
  }
  return counts;
}

/**
 * Fetch attendance for `rows` and return them with a live `attendanceCount`
 * merged on (the field EventCard reads first). Order and every other field
 * are preserved.
 */
export async function withEventAttendanceCounts<T extends { id: string }>(
  rows: T[],
): Promise<(T & { attendanceCount: number })[]> {
  if (rows.length === 0) return [];
  const counts = await fetchEventAttendanceCounts(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, attendanceCount: counts[r.id] ?? 0 }));
}
