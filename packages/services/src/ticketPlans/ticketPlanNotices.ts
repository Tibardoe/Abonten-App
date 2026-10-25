import { logger } from "@abonten/core/logger";
import type { TicketPlanEndReason } from "@abonten/types/ticketPlanType";
import { createNotificationCore } from "../notifications/createNotification";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// The notices a plan's owner gets. Each is a registry notice
// (@abonten/core/notifications/notices, `ticket_plan_*`) worded for the
// recipient; amounts go in as minor units with the currency and dates as
// instants with the event's zone, so every language words them itself.
// Best-effort: a notice that fails never undoes a payment or a refund.

type PlanNoticeContext = {
  planId: string;
  userId: string;
  title: string;
  timezone: string | null;
  currency: string;
  totalMinor: number;
  paidMinor: number;
  deadlineAt: string;
  refundMinor: number;
  keptMinor: number;
  flyerPublicId: string | null;
  flyerVersion: string | null;
  eventId: string;
  completed: boolean;
};

async function loadContext(planId: string): Promise<PlanNoticeContext | null> {
  const { data, error } = await getSupabaseServiceClient()
    .from("ticket_plan")
    .select(
      "id, user_id, event_id, currency, total_minor, paid_minor, deadline_at, refund_minor, kept_minor, status, event:event_id(title, timezone, flyer_public_id, flyer_version)",
    )
    .eq("id", planId)
    .maybeSingle();
  if (error || !data) {
    if (error)
      logger.error(`ticketPlanNotices: load failed (${error.message})`);
    return null;
  }
  const event = data.event as unknown as {
    title: string | null;
    timezone: string | null;
    flyer_public_id: string | null;
    flyer_version: string | null;
  } | null;
  return {
    planId: data.id,
    userId: data.user_id,
    title: event?.title ?? "",
    timezone: event?.timezone ?? null,
    currency: data.currency,
    totalMinor: Number(data.total_minor),
    paidMinor: Number(data.paid_minor),
    deadlineAt: data.deadline_at,
    refundMinor: Number(data.refund_minor),
    keptMinor: Number(data.kept_minor),
    flyerPublicId: event?.flyer_public_id ?? null,
    flyerVersion: event?.flyer_version ?? null,
    eventId: data.event_id,
    completed: data.status === "completed",
  };
}

async function send(
  ctx: PlanNoticeContext,
  type: string,
  id: string,
  params: Record<string, string | number | null>,
): Promise<void> {
  await createNotificationCore(getSupabaseServiceClient(), {
    userId: ctx.userId,
    type,
    notice: {
      id,
      params: {
        title: ctx.title,
        currency: ctx.currency,
        timezone: ctx.timezone,
        ...params,
      },
    },
    link: `/ticket-plans/${ctx.planId}`,
    data: { kind: "ticket_plan", planId: ctx.planId, eventId: ctx.eventId },
    imagePublicId: ctx.flyerPublicId,
    imageVersion: ctx.flyerVersion,
  }).catch((error) =>
    logger.error(
      `ticketPlanNotices: ${id} for plan ${ctx.planId} failed (${error})`,
    ),
  );
}

/** A part arrived and something is still left to pay. */
export async function noticePlanPartReceived(
  planId: string,
  partMinor: number,
): Promise<void> {
  const ctx = await loadContext(planId);
  if (!ctx || ctx.paidMinor >= ctx.totalMinor) return;
  await send(ctx, "ticket_plan_payment", "ticket_plan_part_received", {
    partMinor,
    paidMinor: ctx.paidMinor,
    totalMinor: ctx.totalMinor,
    leftMinor: ctx.totalMinor - ctx.paidMinor,
    deadlineAt: ctx.deadlineAt,
  });
}

/** The deadline is getting close and something is still left to pay. */
export async function noticePlanReminder(
  planId: string,
  days: number,
): Promise<void> {
  const ctx = await loadContext(planId);
  if (!ctx || ctx.paidMinor >= ctx.totalMinor) return;
  await send(ctx, "ticket_plan_reminder", "ticket_plan_reminder", {
    days,
    leftMinor: ctx.totalMinor - ctx.paidMinor,
    deadlineAt: ctx.deadlineAt,
  });
}

const ENDED_NOTICE: Partial<Record<TicketPlanEndReason, string>> = {
  deadline: "ticket_plan_lapsed",
  buyer: "ticket_plan_cancelled",
  event_cancelled: "ticket_plan_event_cancelled",
  admin: "ticket_plan_ended_by_staff",
};

/**
 * A plan ended unfinished. Nothing is sent for a hold that ran out before
 * any payment (nothing to say beyond what the screen showed) or for a
 * closed account.
 */
export async function noticePlanEnded(
  planId: string,
  reason: TicketPlanEndReason,
): Promise<void> {
  const id = ENDED_NOTICE[reason];
  if (!id) return;
  const ctx = await loadContext(planId);
  if (!ctx) return;
  await send(ctx, "ticket_plan_ended", id, {
    refunds: ctx.refundMinor > 0 ? "yes" : "no",
    refundMinor: ctx.refundMinor,
    keptMinor: ctx.keptMinor,
    deadlineAt: ctx.deadlineAt,
  });
}

/** Every share of the plan's refund has reached the buyer. */
export async function noticePlanRefunded(planId: string): Promise<void> {
  const ctx = await loadContext(planId);
  if (!ctx) return;
  await send(ctx, "refund_completed", "ticket_plan_refunded", {
    refundMinor: ctx.refundMinor,
  });
}

/** The provider refused part of the plan's refund; staff will follow up. */
export async function noticePlanRefundProblem(planId: string): Promise<void> {
  const ctx = await loadContext(planId);
  if (!ctx) return;
  await send(ctx, "refund_failed", "ticket_plan_refund_problem", {});
}
