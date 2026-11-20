// Queues the texts of a move (docs/architecture/event-reschedule.md §1):
// one row per person its notice went to who has a verified phone. Sent by
// rescheduleTextsCore (right after the move, and by the reschedule-texts
// job). Kept apart from it so rescheduleEventCore can queue without a
// circular import.

import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

/** RESCHEDULE_TEXTS_KILL_SWITCH=true on the web deployment stops the texts. */
export function isRescheduleTextsKillSwitchOn(): boolean {
  return process.env.RESCHEDULE_TEXTS_KILL_SWITCH === "true";
}

/** Queues the texts of a move; returns how many. Never throws. */
export async function queueRescheduleTextsCore(
  rescheduleId: string,
): Promise<number> {
  if (isRescheduleTextsKillSwitchOn()) return 0;
  const { data, error } = await getSupabaseServiceClient().rpc(
    "event_reschedule_queue_texts",
    { p_reschedule_id: rescheduleId },
  );
  if (error) {
    logger.error(`reschedule texts: queue failed (${error.message})`);
    return 0;
  }
  return Number(data ?? 0);
}
