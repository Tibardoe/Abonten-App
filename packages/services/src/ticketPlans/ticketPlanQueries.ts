import { logger } from "@abonten/core/logger";
import { fromMajor } from "@abonten/core/money/money";
import { partBounds, unfinishedRefund } from "@abonten/core/ticketPlans/rules";
import type { Database } from "@abonten/types/database.types";
import type {
  TicketPlanDetail,
  TicketPlanEndReason,
  TicketPlanLine,
  TicketPlanPart,
  TicketPlanPartRefundStatus,
  TicketPlanRefundStatus,
  TicketPlanStatus,
  TicketPlanSummary,
} from "@abonten/types/ticketPlanType";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// Reading plans for their owner. Every read is the service role scoped to
// the owner's id: the plan tables have no client access at all (the row
// shows what was paid and refunded, which only the service may vouch for).

export type TicketPlanRow = Database["public"]["Tables"]["ticket_plan"]["Row"];

type EventJoin = {
  title: string | null;
  event_code: string | null;
  flyer_public_id: string | null;
  flyer_version: string | null;
  timezone: string | null;
};

const PLAN_SELECT =
  "*, event:event_id(title, event_code, flyer_public_id, flyer_version, timezone)";

type PlanWithEvent = TicketPlanRow & { event: EventJoin | null };

async function ticketCounts(
  sessionIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (sessionIds.length === 0) return counts;
  const { data, error } = await getSupabaseServiceClient()
    .from("ticket_checkout")
    .select("checkout_session_id, quantity")
    .in("checkout_session_id", sessionIds);
  if (error) {
    logger.error(`ticketPlanQueries: counts failed (${error.message})`);
    return counts;
  }
  for (const row of data ?? []) {
    const key = row.checkout_session_id as string;
    counts.set(key, (counts.get(key) ?? 0) + Number(row.quantity ?? 0));
  }
  return counts;
}

function toSummary(row: PlanWithEvent, ticketCount: number): TicketPlanSummary {
  return {
    id: row.id,
    status: row.status as TicketPlanStatus,
    eventId: row.event_id,
    eventTitle: row.event?.title ?? "",
    eventCode: row.event?.event_code ?? null,
    eventFlyerPublicId: row.event?.flyer_public_id ?? null,
    eventFlyerVersion: row.event?.flyer_version ?? null,
    eventStartsAt: row.event_starts_at,
    timezone: row.event?.timezone ?? null,
    currency: row.currency,
    totalMinor: Number(row.total_minor),
    paidMinor: Number(row.paid_minor),
    deadlineAt: row.deadline_at,
    ticketCount,
    refundStatus: row.refund_status as TicketPlanRefundStatus,
    refundMinor: Number(row.refund_minor),
    createdAt: row.created_at,
  };
}

/** The owner's plans, open ones first, then the most recent. */
export async function listPlanSummaries(
  userId: string,
  options: { limit?: number } = {},
): Promise<TicketPlanSummary[] | null> {
  const { data, error } = await getSupabaseServiceClient()
    .from("ticket_plan")
    .select(PLAN_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);
  if (error) {
    logger.error(`ticketPlanQueries: list failed (${error.message})`);
    return null;
  }
  const rows = (data ?? []) as unknown as PlanWithEvent[];
  const counts = await ticketCounts(rows.map((r) => r.checkout_session_id));
  const open = new Set(["awaiting_payment", "active", "settling"]);
  return rows
    .map((row) => toSummary(row, counts.get(row.checkout_session_id) ?? 0))
    .sort((a, b) => {
      const ao = open.has(a.status) ? 0 : 1;
      const bo = open.has(b.status) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if (ao === 0) return a.deadlineAt.localeCompare(b.deadlineAt);
      return b.createdAt.localeCompare(a.createdAt);
    });
}

/** One plan with its lines, parts and what can happen next; null if not theirs. */
export async function loadPlanDetail(
  userId: string,
  planId: string,
): Promise<TicketPlanDetail | null | "error"> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("ticket_plan")
    .select(PLAN_SELECT)
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    logger.error(`ticketPlanQueries: detail failed (${error.message})`);
    return "error";
  }
  if (!data) return null;
  const row = data as unknown as PlanWithEvent;

  const [linesResult, partsResult, openAttempt] = await Promise.all([
    supabase
      .from("ticket_checkout")
      .select(
        "id, ticket_type_id, quantity, unit_price, total_price, ticket_type:ticket_type_id(type)",
      )
      .eq("checkout_session_id", row.checkout_session_id)
      .eq("user_id", userId),
    supabase
      .from("ticket_plan_payment")
      .select("id, amount_minor, method, paid_at, refund_minor, refund_status")
      .eq("plan_id", row.id)
      .order("paid_at", { ascending: true }),
    supabase
      .from("payment_attempt")
      .select("id")
      .eq("ticket_plan_id", row.id)
      .in("status", ["initiated", "pending", "processing"])
      .not("provider_reference", "is", null)
      .maybeSingle(),
  ]);

  const lineRows = (linesResult.data ?? []) as unknown as {
    id: string;
    ticket_type_id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    ticket_type: { type: string | null } | null;
  }[];
  // ticket_checkout keeps major units; the plan counts in minor units.
  const minor = (major: number) =>
    fromMajor(Number(major), row.currency).amountMinor;
  const lines: TicketPlanLine[] = lineRows.map((l) => ({
    ticketTypeId: l.ticket_type_id,
    ticketTypeName: null,
    tier: l.ticket_type?.type ?? null,
    quantity: Number(l.quantity),
    unitPriceMinor: minor(l.unit_price),
    amountMinor: minor(l.total_price),
  }));

  const parts: TicketPlanPart[] = (partsResult.data ?? []).map((p) => ({
    id: p.id,
    amountMinor: Number(p.amount_minor),
    method: p.method ?? null,
    paidAt: p.paid_at,
    refundMinor: Number(p.refund_minor),
    refundStatus: p.refund_status as TicketPlanPartRefundStatus,
  }));

  let ticketIds: string[] = [];
  if (row.status === "completed" && lineRows.length > 0) {
    const { data: tickets } = await supabase
      .from("ticket")
      .select("id")
      .in(
        "ticket_checkout_id",
        lineRows.map((l) => l.id),
      );
    ticketIds = (tickets ?? []).map((t) => t.id);
  }

  const status = row.status as TicketPlanStatus;
  const amounts = {
    status,
    totalMinor: Number(row.total_minor),
    paidMinor: Number(row.paid_minor),
    firstPartMinMinor: Number(row.first_part_min_minor),
    partMinMinor: Number(row.part_min_minor),
  };
  const pastDeadline = new Date(row.deadline_at).getTime() <= Date.now();

  return {
    ...toSummary(
      row,
      lines.reduce((s, l) => s + l.quantity, 0),
    ),
    occurrenceId: row.occurrence_id,
    ticketMinor: Number(row.ticket_minor),
    feeMinor: Number(row.fee_minor),
    taxMinor: Number(row.tax_minor),
    firstPartMinMinor: amounts.firstPartMinMinor,
    partMinMinor: amounts.partMinMinor,
    keepFeeOnRefund: row.keep_fee_on_refund,
    holdExpiresAt: row.hold_expires_at,
    endedReason: (row.ended_reason as TicketPlanEndReason | null) ?? null,
    endedAt: row.ended_at,
    completedAt: row.completed_at,
    keptMinor: Number(row.kept_minor),
    lines,
    parts,
    nextPart: pastDeadline ? null : partBounds(amounts),
    pendingAttemptId: openAttempt.data?.id ?? null,
    refundIfEnded: unfinishedRefund({
      paidMinor: amounts.paidMinor,
      ticketMinor: Number(row.ticket_minor),
      totalMinor: amounts.totalMinor,
      keepFeeOnRefund: row.keep_fee_on_refund,
    }),
    ticketIds,
  };
}
