import { logger } from "@abonten/core/logger";
import { dueReminder } from "@abonten/core/ticketPlans/rules";
import { finalizePayment } from "../payments/finalizePayment";
import type { PaymentFulfillmentDeps } from "../payments/fulfillmentDeps";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { endTicketPlan } from "./ticketPlanLifecycle";
import { noticePlanReminder } from "./ticketPlanNotices";
import { readTicketPlanSettings, ticketPlanRules } from "./ticketPlanProgram";
import {
  handOverStuckPlanRefunds,
  requestPlannedPlanRefunds,
} from "./ticketPlanRefunds";

// The ticket-plans job. The `ticket-plans-dispatch` pg_cron job posts to
// /api/maintenance/ticket-plans every five minutes while
// ticket_plan_work_due() finds something, and the route calls this:
//
//   1. a date moved earlier: the plan's deadline moves with it;
//   2. plans that must end: a hold that ran out before the first part, a
//      deadline that passed, an event that was cancelled, an account that
//      was closed (each through ticket_plan_release, with its refund);
//   3. refund shares to ask the provider for, and shares stuck mid-request
//      handed to staff;
//   4. a finished plan whose settlement did not complete is finalized again
//      (the same finalizePayment the app and the webhook use);
//   5. reminders before the deadline.
//
// Every step is safe to run twice at once: the database functions lock the
// plan, refund shares are claimed before they are asked for, and a reminder
// is recorded with a compare-and-set on what was already sent.

const BATCH = 100;
/** A settlement touched more recently than this is left for its own request. */
const SETTLEMENT_RETRY_MINUTES = 10;

export type TicketPlanMaintenanceSummary = {
  deadlinesMoved: number;
  expired: number;
  lapsed: number;
  cancelledWithEvent: number;
  closedAccounts: number;
  busy: number;
  refundsRequested: number;
  refundsHandedToStaff: number;
  settlementsRetried: number;
  completed: number;
  reminders: number;
};

type OpenPlanRow = {
  id: string;
  user_id: string;
  status: string;
  deadline_at: string;
  occurrence_id: string | null;
  event: {
    status: string;
    starts_at: string | null;
    event_occurrence: { id: string; starts_at: string }[];
  } | null;
};

export async function runTicketPlanMaintenanceCore(
  deps: PaymentFulfillmentDeps,
  now: Date = new Date(),
): Promise<TicketPlanMaintenanceSummary> {
  const supabase = getSupabaseServiceClient();
  const summary: TicketPlanMaintenanceSummary = {
    deadlinesMoved: 0,
    expired: 0,
    lapsed: 0,
    cancelledWithEvent: 0,
    closedAccounts: 0,
    busy: 0,
    refundsRequested: 0,
    refundsHandedToStaff: 0,
    settlementsRetried: 0,
    completed: 0,
    reminders: 0,
  };
  const settings = await readTicketPlanSettings(supabase, { fresh: true });
  const rules = ticketPlanRules(settings);
  const nowIso = now.toISOString();

  const end = async (
    planId: string,
    status: "expired" | "lapsed" | "cancelled",
    reason: Parameters<typeof endTicketPlan>[2],
    counter: keyof TicketPlanMaintenanceSummary,
  ) => {
    const result = await endTicketPlan(planId, status, reason);
    if (result.outcome === "ended") summary[counter] += 1;
    else if (result.outcome === "busy") summary.busy += 1;
  };

  // 1 + 2c: open plans, their event's status and dates.
  const { data: open, error: openError } = await supabase
    .from("ticket_plan")
    .select(
      "id, user_id, status, deadline_at, occurrence_id, event:event_id(status, starts_at, event_occurrence(id, starts_at))",
    )
    .in("status", ["awaiting_payment", "active", "settling"])
    .order("deadline_at", { ascending: true })
    .limit(500);
  if (openError) {
    logger.error(`ticketPlans job: open plans not read (${openError.message})`);
  }
  const openPlans = (open ?? []) as unknown as OpenPlanRow[];
  for (const plan of openPlans) {
    if (plan.event?.status === "canceled") {
      await end(plan.id, "cancelled", "event_cancelled", "cancelledWithEvent");
      continue;
    }
    if (plan.status === "settling" || !plan.event) continue;
    // A plan on a multi-date event always names its date; one without a
    // date is on a single-date event.
    if (!plan.occurrence_id && plan.event.event_occurrence.length > 0) continue;
    const startsAt = plan.occurrence_id
      ? plan.event.event_occurrence.find((o) => o.id === plan.occurrence_id)
          ?.starts_at
      : plan.event.starts_at;
    if (!startsAt) continue;
    const latest = new Date(
      new Date(startsAt).getTime() - rules.deadlineHoursBeforeStart * 3_600_000,
    );
    if (latest.getTime() < new Date(plan.deadline_at).getTime()) {
      const { error } = await supabase
        .from("ticket_plan")
        .update({ deadline_at: latest.toISOString() })
        .eq("id", plan.id)
        .in("status", ["awaiting_payment", "active"]);
      if (!error) summary.deadlinesMoved += 1;
    }
  }

  // 2a: the first part never came.
  const holdBefore = new Date(now.getTime() - 60_000).toISOString();
  const { data: unstarted } = await supabase
    .from("ticket_plan")
    .select("id")
    .eq("status", "awaiting_payment")
    .lt("hold_expires_at", holdBefore)
    .limit(BATCH);
  for (const plan of unstarted ?? []) {
    await end(plan.id, "expired", "hold_expired", "expired");
  }

  // 2b: the deadline passed.
  const { data: overdue } = await supabase
    .from("ticket_plan")
    .select("id")
    .eq("status", "active")
    .lt("deadline_at", nowIso)
    .limit(BATCH);
  for (const plan of overdue ?? []) {
    await end(plan.id, "lapsed", "deadline", "lapsed");
  }

  // 2d: the buyer closed their account (a soft delete: user_info stays,
  // status 4).
  const owners = [...new Set(openPlans.map((p) => p.user_id))];
  if (owners.length > 0) {
    const { data: closedOwners } = await supabase
      .from("user_info")
      .select("id")
      .in("id", owners)
      .eq("status_id", 4);
    const closed = new Set((closedOwners ?? []).map((u) => u.id));
    for (const plan of openPlans) {
      if (closed.has(plan.user_id)) {
        await end(plan.id, "cancelled", "account_closed", "closedAccounts");
      }
    }
  }

  // 3: refunds.
  const refunds = await requestPlannedPlanRefunds();
  summary.refundsRequested = refunds.requested;
  summary.refundsHandedToStaff =
    refunds.handedToStaff + (await handOverStuckPlanRefunds());

  // 4: finished plans whose tickets are not issued yet.
  const { data: settling } = await supabase
    .from("ticket_plan")
    .select(
      "id, settlement_attempt_id, settlement:settlement_attempt_id(status, transaction_id, updated_at)",
    )
    .eq("status", "settling")
    .limit(BATCH);
  for (const plan of (settling ?? []) as unknown as {
    id: string;
    settlement_attempt_id: string | null;
    settlement: {
      status: string;
      transaction_id: string | null;
      updated_at: string;
    } | null;
  }[]) {
    const attempt = plan.settlement;
    if (!plan.settlement_attempt_id || !attempt) {
      logger.error(
        `ticketPlans job: plan ${plan.id} is settling without a settlement`,
      );
      continue;
    }
    if (attempt.status === "succeeded" && attempt.transaction_id) {
      const { data: done } = await supabase.rpc("ticket_plan_mark_completed", {
        p_plan_id: plan.id,
        p_transaction_id: attempt.transaction_id,
      });
      if (done) summary.completed += 1;
      continue;
    }
    const idleMs = now.getTime() - new Date(attempt.updated_at).getTime();
    if (
      ["initiated", "pending", "fulfillment_failed"].includes(attempt.status) &&
      idleMs > SETTLEMENT_RETRY_MINUTES * 60_000
    ) {
      summary.settlementsRetried += 1;
      const result = await finalizePayment(plan.settlement_attempt_id, deps);
      if (result.status !== "succeeded") {
        logger.warn(
          `ticketPlans job: settlement of plan ${plan.id} is still ${result.status}`,
        );
      }
    }
  }

  // 5: reminders.
  if (rules.reminderDays.length > 0) {
    const horizon = new Date(
      now.getTime() + Math.max(...rules.reminderDays) * 86_400_000,
    ).toISOString();
    const { data: soon } = await supabase
      .from("ticket_plan")
      .select("id, deadline_at, reminders_sent, paid_minor, total_minor")
      .eq("status", "active")
      .gt("deadline_at", nowIso)
      .lte("deadline_at", horizon)
      .limit(500);
    for (const plan of soon ?? []) {
      if (Number(plan.paid_minor) >= Number(plan.total_minor)) continue;
      const sent = plan.reminders_sent ?? [];
      const due = dueReminder(
        new Date(plan.deadline_at),
        rules.reminderDays,
        sent,
        now.getTime(),
      );
      if (!due) continue;
      // Compare-and-set on what was already sent, so two runs never send
      // the same reminder twice.
      const { data: marked } = await supabase
        .from("ticket_plan")
        .update({ reminders_sent: [...sent, ...due.markSent] })
        .eq("id", plan.id)
        // An array literal: .eq() would send "7,2" without the braces.
        .filter("reminders_sent", "eq", `{${sent.join(",")}}`)
        .select("id")
        .maybeSingle();
      if (!marked) continue;
      await noticePlanReminder(plan.id, due.send);
      summary.reminders += 1;
    }
  }

  return summary;
}
