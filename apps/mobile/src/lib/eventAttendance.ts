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

type TicketTypeRow = {
  price: number;
  currency: string;
  quantity: number | null;
};

/**
 * event_id -> its ticket tiers' remaining stock.
 *
 * The discovery RPCs aggregate ticket types down to min_price/currency, so a
 * card fed from them had no idea how many tickets actually remained and fell
 * back to `capacity - attending`. An event with capacity 100 and 3 tickets
 * therefore advertised "100 spots left" — and never "Sold out" — even with
 * every ticket gone. `ticket_type_select` RLS exposes the tiers of any
 * published or canceled event, so this is the same data the buy screen reads.
 *
 * Never throws: a failed lookup degrades to "no ticket data", which puts the
 * cards back on the capacity-only figure rather than breaking the list.
 */
export async function fetchEventTicketTypes(
  eventIds: readonly string[],
): Promise<Record<string, TicketTypeRow[]>> {
  const ids = Array.from(new Set(eventIds.filter(Boolean)));
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from("ticket_type")
    .select("event_id, price, currency, quantity")
    .in("event_id", ids);

  if (error || !data) return {};

  const byEvent: Record<string, TicketTypeRow[]> = {};
  for (const row of data) {
    // ticket_type.event_id is nullable in the schema; a tier with no event
    // can't belong to any card.
    if (!row.event_id) continue;
    let list = byEvent[row.event_id];
    if (!list) {
      list = [];
      byEvent[row.event_id] = list;
    }
    list.push({
      price: Number(row.price ?? 0),
      currency: row.currency ?? "GHS",
      quantity: row.quantity == null ? null : Number(row.quantity),
    });
  }
  return byEvent;
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

/**
 * Attendance + remaining ticket stock in two parallel round trips, merged onto
 * `rows`. Use this wherever EventCards are rendered from a discovery RPC —
 * both numbers are needed before "spots left" and "Sold out" can be honest.
 * An event that already carries `ticket_type` (a detail read) keeps its own.
 */
export async function withEventAvailability<
  T extends { id: string; ticket_type?: unknown },
>(rows: T[]): Promise<(T & { attendanceCount: number })[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [counts, ticketTypes] = await Promise.all([
    fetchEventAttendanceCounts(ids),
    fetchEventTicketTypes(ids),
  ]);
  return rows.map((r) => ({
    ...r,
    attendanceCount: counts[r.id] ?? 0,
    ticket_type: Array.isArray(r.ticket_type)
      ? r.ticket_type
      : (ticketTypes[r.id] ?? undefined),
  }));
}
