import { supabase } from "@/lib/supabase";
import { readTicketTiers } from "@abonten/core/eventAvailability";

// Native mirror of the web `getEventAttendanceCounts` action
// (apps/web/src/actions/getAttendace.ts).
//
// Every event list function returns attendance and per-tier stock inline
// (migration 20261002180000), and the discovery hooks read them with
// `withInlineEventAvailability` from @abonten/core. What is left for this
// file is rows read straight from the `event` table (a profile's events):
// those carry no attendance figure, so a card fed from them would say "0
// going" and never "Sold out". `get_event_attendance_counts` is an
// anon-safe SECURITY DEFINER RPC that returns only the aggregate (summing
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
 * A card that knows only min_price/currency has no idea how many tickets
 * remain and falls back to `capacity - attending`: an event with capacity
 * 100 and 3 tickets would advertise "100 spots left" — and never "Sold
 * out" — even with every ticket gone. `ticket_type_select` RLS exposes the
 * tiers of any published or canceled event, so this is the same data the
 * buy screen reads.
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
      currency: row.currency ?? "",
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

type AvailabilityRow = {
  id: string;
  ticket_type?: unknown;
  // The event list functions return both of these inline.
  attendance_count?: number | string | null;
  ticket_types?: unknown;
};

/**
 * Attendance + remaining ticket stock merged onto `rows`. Use this where
 * EventCards are rendered from rows that may not carry them (a read of the
 * `event` table) — both numbers are needed before "spots left" and "Sold
 * out" can be honest.
 *
 * Rows that already carry the figures (an event list function's
 * `attendance_count` and `ticket_types`; a detail read's `ticket_type`) are
 * used as-is. Only rows missing one of them cost a round trip, and those go
 * out in parallel.
 */
export async function withEventAvailability<T extends AvailabilityRow>(
  rows: T[],
): Promise<(T & { attendanceCount: number })[]> {
  if (rows.length === 0) return [];

  const needAttendance = rows
    .filter((r) => r.attendance_count == null)
    .map((r) => r.id);
  const needTickets = rows
    .filter(
      (r) => !Array.isArray(r.ticket_type) && !Array.isArray(r.ticket_types),
    )
    .map((r) => r.id);

  const none: Record<string, never> = {};
  const [counts, ticketTypes] = await Promise.all([
    needAttendance.length
      ? fetchEventAttendanceCounts(needAttendance)
      : Promise.resolve<Record<string, number>>(none),
    needTickets.length
      ? fetchEventTicketTypes(needTickets)
      : Promise.resolve<Record<string, TicketTypeRow[]>>(none),
  ]);

  return rows.map((r) => ({
    ...r,
    attendanceCount:
      r.attendance_count != null
        ? Number(r.attendance_count) || 0
        : (counts[r.id] ?? 0),
    ticket_type: Array.isArray(r.ticket_type)
      ? r.ticket_type
      : (readTicketTiers(r.ticket_types) ?? ticketTypes[r.id] ?? undefined),
  }));
}
