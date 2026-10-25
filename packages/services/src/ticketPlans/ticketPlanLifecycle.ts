import { logger } from "@abonten/core/logger";
import type {
  TicketPlanEndReason,
  TicketPlanStatus,
} from "@abonten/types/ticketPlanType";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { noticePlanEnded } from "./ticketPlanNotices";
import { requestPlannedPlanRefunds } from "./ticketPlanRefunds";

// Ending an unfinished plan, from whichever side ends it: the buyer, the
// deadline, the event's cancellation, a closed account, staff. The database
// (ticket_plan_release) puts the seats back on sale, closes any open part
// charge and plans the refund in one transaction; this then asks the
// provider for the refund shares and tells the buyer. A plan whose payment
// is being confirmed at that very moment answers "busy": the caller says so,
// or (the job) tries again on its next run.

export type EndPlanOutcome =
  | {
      outcome: "ended";
      status: Extract<TicketPlanStatus, "expired" | "lapsed" | "cancelled">;
      refundMinor: number;
      keptMinor: number;
    }
  | { outcome: "busy" }
  | { outcome: "not_open"; status: TicketPlanStatus }
  | { outcome: "error"; message: string };

export async function endTicketPlan(
  planId: string,
  status: "expired" | "lapsed" | "cancelled",
  reason: TicketPlanEndReason,
): Promise<EndPlanOutcome> {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "ticket_plan_release",
    { p_plan_id: planId, p_status: status, p_reason: reason },
  );
  if (error) {
    logger.error(
      `ticketPlanLifecycle: release of plan ${planId} failed (${error.message})`,
    );
    return { outcome: "error", message: error.message };
  }
  const result = (data ?? {}) as {
    outcome?: string;
    status?: TicketPlanStatus;
    refund_minor?: number;
    kept_minor?: number;
  };
  if (result.outcome === "busy") return { outcome: "busy" };
  if (result.outcome !== "ended") {
    return {
      outcome: "not_open",
      status: (result.status ?? "cancelled") as TicketPlanStatus,
    };
  }

  const refundMinor = Number(result.refund_minor ?? 0);
  if (refundMinor > 0) {
    await requestPlannedPlanRefunds({ planId }).catch((e) =>
      logger.error(
        `ticketPlanLifecycle: refund request for plan ${planId} threw (${e})`,
      ),
    );
  }
  await noticePlanEnded(planId, reason);

  return {
    outcome: "ended",
    status,
    refundMinor,
    keptMinor: Number(result.kept_minor ?? 0),
  };
}

/**
 * The event was cancelled: every plan still running on it ends, with its
 * refund. A plan that answers busy is ended by the ticket-plans job, which
 * looks for open plans on cancelled events on every run.
 */
export async function endTicketPlansForEvent(
  eventId: string,
): Promise<{ ended: number; busy: number }> {
  const { data, error } = await getSupabaseServiceClient()
    .from("ticket_plan")
    .select("id")
    .eq("event_id", eventId)
    .in("status", ["awaiting_payment", "active", "settling"]);
  if (error) {
    logger.error(
      `ticketPlanLifecycle: plans of event ${eventId} not listed (${error.message})`,
    );
    return { ended: 0, busy: 0 };
  }
  let ended = 0;
  let busy = 0;
  for (const row of data ?? []) {
    const result = await endTicketPlan(row.id, "cancelled", "event_cancelled");
    if (result.outcome === "ended") ended += 1;
    else if (result.outcome === "busy") busy += 1;
  }
  return { ended, busy };
}
