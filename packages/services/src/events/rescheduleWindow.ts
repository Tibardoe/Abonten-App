// Whether a move's refund window is open (docs/architecture/event-reschedule.md
// §1): until refund_until for a move, and for as long as the event stays
// postponed for a postponement. Used by the holder's ticket notice and by a
// running Pay small small plan, whose cancellation then gives back the fee
// too.

import { rescheduleRefundOpen } from "@abonten/core/eventReschedule";
import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

export type MoveWindowRow = {
  kind: "move" | "postpone" | string;
  refund_until: string | null;
};

export function isMoveRefundOpen(
  row: MoveWindowRow,
  event: { status: string | null; postponed_at: string | null },
): boolean {
  if (event.status !== "published") return false;
  if (row.kind === "postpone") return !!event.postponed_at;
  return !!row.refund_until && rescheduleRefundOpen(row.refund_until);
}

/**
 * The latest move that concerns a date of the event (the whole event, or
 * that date) still has its refund window open. False when it never moved.
 */
export async function moveRefundOpenFor(
  eventId: string,
  occurrenceId: string | null,
): Promise<boolean> {
  const svc = getSupabaseServiceClient();
  const [{ data: event }, { data: rows, error }] = await Promise.all([
    svc
      .from("event")
      .select("status, postponed_at")
      .eq("id", eventId)
      .maybeSingle(),
    svc
      .from("event_reschedule")
      .select("kind, refund_until, occurrence_id")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (error) {
    logger.error(`reschedule window: read failed (${error.message})`);
    return false;
  }
  if (!event) return false;
  const row = (rows ?? []).find(
    (r) => !r.occurrence_id || r.occurrence_id === occurrenceId,
  );
  return row ? isMoveRefundOpen(row, event) : false;
}
