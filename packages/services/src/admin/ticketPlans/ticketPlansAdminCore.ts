import { logger } from "@abonten/core/logger";
import { fromMajor } from "@abonten/core/money/money";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  TicketPlanAdminDetail,
  TicketPlanAdminPart,
  TicketPlanAdminRow,
  TicketPlanAdminSettings,
  TicketPlanAdminTotals,
  TicketPlanEndReason,
  TicketPlanPartRefundStatus,
  TicketPlanRefundStatus,
  TicketPlanStatus,
} from "@abonten/types/ticketPlanType";
import type {
  TicketPlanAdminEndInput,
  TicketPlanAdminListInput,
  TicketPlanAdminPartRefundInput,
  TicketPlanSettingsInput,
} from "@abonten/validation/ticketPlanSchemas";
import { endTicketPlan } from "../../ticketPlans/ticketPlanLifecycle";
import {
  isTicketPlansKillSwitchOn,
  mapTicketPlanSettings,
  readTicketPlanSettings,
  resetTicketPlanSettingsCache,
} from "../../ticketPlans/ticketPlanProgram";
import { requestPlannedPlanRefunds } from "../../ticketPlans/ticketPlanRefunds";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// Admin › Finance › Pay small small. Every plan, what was paid towards it,
// how it ended and where its refund is; the money plans hold (the buyers'
// cash on its way to a ticket, not a sale yet) and the fee share kept on
// plans that ended unfinished; the programme settings. Staff can end a plan
// with its refund, and — after checking the provider's dashboard — ask
// again for a refund share the provider refused or never confirmed, or
// record one refunded by hand. Every action is audited.

type PlanRow = Database["public"]["Tables"]["ticket_plan"]["Row"];
type RequestMeta = Record<string, unknown> | undefined;

const denied = <T>(e: unknown): AdminEnvelope<T> =>
  adminError(e) as AdminEnvelope<T>;

// ── Settings ────────────────────────────────────────────────────────

export async function getTicketPlanSettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<
  AdminEnvelope<{ settings: TicketPlanAdminSettings; killSwitch: boolean }>
> {
  try {
    assertPermission(ctx, "plans.view");
  } catch (e) {
    return denied(e);
  }
  const row = await readTicketPlanSettings(supabase, { fresh: true }).catch(
    () => null,
  );
  if (!row) return { status: 500, message: "Couldn't load the settings." };
  return {
    status: 200,
    data: {
      settings: mapTicketPlanSettings(row),
      killSwitch: isTicketPlansKillSwitchOn(),
    },
  };
}

const COLUMN: Record<keyof TicketPlanSettingsInput["patch"], string> = {
  enabled: "enabled",
  audience: "audience",
  betaUserIds: "beta_user_ids",
  firstPartMinBps: "first_part_min_bps",
  partMinBps: "part_min_bps",
  deadlineHoursBeforeStart: "deadline_hours_before_start",
  minDaysToDeadline: "min_days_to_deadline",
  holdMinutes: "hold_minutes",
  maxTicketsPerPlan: "max_tickets_per_plan",
  keepFeeOnRefund: "keep_fee_on_refund",
  reminderDays: "reminder_days",
};

export async function updateTicketPlanSettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: TicketPlanSettingsInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<TicketPlanAdminSettings>> {
  try {
    assertPermission(ctx, "plans.configure");
  } catch (e) {
    return denied(e);
  }
  const beforeRow = await readTicketPlanSettings(supabase, {
    fresh: true,
  }).catch(() => null);
  if (!beforeRow) {
    return { status: 500, message: "Couldn't load the settings." };
  }
  const before = mapTicketPlanSettings(beforeRow);

  const merged = { ...before, ...input.patch };
  if (merged.partMinBps > merged.firstPartMinBps) {
    return {
      status: 400,
      message: "A later part can't have a higher minimum than the first part.",
    };
  }

  const update: Record<string, unknown> = {};
  const changed: (keyof TicketPlanAdminSettings)[] = [];
  for (const [key, value] of Object.entries(input.patch)) {
    const column = COLUMN[key as keyof typeof COLUMN];
    if (!column || value === undefined) continue;
    const normalized =
      key === "reminderDays"
        ? [...new Set(value as number[])].sort((a, b) => b - a)
        : value;
    if (
      JSON.stringify(before[key as keyof TicketPlanAdminSettings]) ===
      JSON.stringify(normalized)
    ) {
      continue;
    }
    update[column] = normalized;
    changed.push(key as keyof TicketPlanAdminSettings);
  }
  if (changed.length === 0) return { status: 400, message: "Nothing changed." };
  update.updated_at = new Date().toISOString();
  update.updated_by = ctx.userId;

  const { data, error } = await supabase
    .from("ticket_plan_program_setting")
    .update(update as never)
    .eq("id", 1)
    .eq("updated_at", input.expectedUpdatedAt)
    .select("*")
    .maybeSingle();
  if (error) {
    logger.error(`updateTicketPlanSettingsCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't save the settings." };
  }
  if (!data) {
    return {
      status: 409,
      message: "Someone else changed these settings. Reload and try again.",
    };
  }
  resetTicketPlanSettingsCache();
  const after = mapTicketPlanSettings(data);
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "plans.settings.update",
    targetType: "ticket_plan_program_setting",
    targetId: "1",
    summary: `Pay small small settings changed: ${changed.join(", ")}`,
    reason: input.reason,
    before: Object.fromEntries(changed.map((k) => [k, before[k]])),
    after: Object.fromEntries(changed.map((k) => [k, after[k]])),
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: "Settings saved.", data: after };
}

// ── Lists ───────────────────────────────────────────────────────────

type Profile = { username: string | null; full_name: string | null };

async function profilesFor(
  supabase: ServiceRoleClient,
  userIds: string[],
): Promise<Map<string, Profile>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("user_info")
    .select("id, username, full_name")
    .in("id", ids);
  if (error) throw new Error(error.message);
  return new Map(
    (data ?? []).map((u) => [
      u.id,
      { username: u.username ?? null, full_name: u.full_name },
    ]),
  );
}

type PlanWithEvent = PlanRow & {
  event: { title: string | null } | null;
};

function toRow(
  r: PlanWithEvent,
  profile: Profile | undefined,
): TicketPlanAdminRow {
  return {
    id: r.id,
    userId: r.user_id,
    username: profile?.username ?? null,
    displayName: profile?.full_name ?? null,
    eventId: r.event_id,
    eventTitle: r.event?.title ?? "",
    status: r.status as TicketPlanStatus,
    currency: r.currency,
    totalMinor: Number(r.total_minor),
    paidMinor: Number(r.paid_minor),
    refundStatus: r.refund_status as TicketPlanRefundStatus,
    refundMinor: Number(r.refund_minor),
    keptMinor: Number(r.kept_minor),
    endedReason: (r.ended_reason as TicketPlanEndReason | null) ?? null,
    deadlineAt: r.deadline_at,
    createdAt: r.created_at,
  };
}

async function totals(
  supabase: ServiceRoleClient,
): Promise<TicketPlanAdminTotals> {
  const [held, kept, refunding] = await Promise.all([
    supabase
      .from("ticket_plan")
      .select("currency, paid_minor")
      .in("status", ["awaiting_payment", "active", "settling"]),
    supabase
      .from("ticket_plan")
      .select("currency, kept_minor")
      .in("status", ["expired", "lapsed", "cancelled"])
      .gt("kept_minor", 0),
    supabase
      .from("ticket_plan_payment")
      .select("currency, refund_minor")
      .in("refund_status", ["planned", "requesting", "requested", "failed"]),
  ]);
  for (const r of [held, kept, refunding]) {
    if (r.error) throw new Error(r.error.message);
  }
  const by = new Map<
    string,
    { heldMinor: number; keptMinor: number; refundingMinor: number }
  >();
  const at = (c: string) => {
    let row = by.get(c);
    if (!row) {
      row = { heldMinor: 0, keptMinor: 0, refundingMinor: 0 };
      by.set(c, row);
    }
    return row;
  };
  for (const p of held.data ?? [])
    at(p.currency).heldMinor += Number(p.paid_minor);
  for (const p of kept.data ?? [])
    at(p.currency).keptMinor += Number(p.kept_minor);
  for (const p of refunding.data ?? [])
    at(p.currency).refundingMinor += Number(p.refund_minor);
  return [...by.entries()].map(([currency, v]) => ({ currency, ...v }));
}

export async function listTicketPlansAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: TicketPlanAdminListInput,
): Promise<
  AdminEnvelope<{ rows: TicketPlanAdminRow[]; totals: TicketPlanAdminTotals }>
> {
  try {
    assertPermission(ctx, "plans.view");
  } catch (e) {
    return denied(e);
  }
  try {
    let query = supabase
      .from("ticket_plan")
      .select("*, event:event_id(title)")
      .order("created_at", { ascending: false })
      .limit(input.limit);
    if (input.status) query = query.eq("status", input.status);
    if (input.refund) query = query.eq("refund_status", input.refund);
    if (input.userId) query = query.eq("user_id", input.userId);
    if (input.eventId) query = query.eq("event_id", input.eventId);
    if (input.before) query = query.lt("created_at", input.before);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as PlanWithEvent[];
    const [profiles, sums] = await Promise.all([
      profilesFor(
        supabase,
        rows.map((r) => r.user_id),
      ),
      totals(supabase),
    ]);
    return {
      status: 200,
      data: {
        rows: rows.map((r) => toRow(r, profiles.get(r.user_id))),
        totals: sums,
      },
    };
  } catch (error) {
    logger.error(`listTicketPlansAdminCore: ${error}`);
    return { status: 500, message: "Couldn't load the plans." };
  }
}

export async function getTicketPlanAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  planId: string,
): Promise<AdminEnvelope<TicketPlanAdminDetail>> {
  try {
    assertPermission(ctx, "plans.view");
  } catch (e) {
    return denied(e);
  }
  try {
    const { data, error } = await supabase
      .from("ticket_plan")
      .select("*, event:event_id(title)")
      .eq("id", planId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { status: 404, message: "Plan not found." };
    const row = data as unknown as PlanWithEvent;

    const [profiles, lines, parts, settlement] = await Promise.all([
      profilesFor(supabase, [row.user_id]),
      supabase
        .from("ticket_checkout")
        .select(
          "ticket_type_id, quantity, unit_price, total_price, ticket_type:ticket_type_id(type)",
        )
        .eq("checkout_session_id", row.checkout_session_id),
      supabase
        .from("ticket_plan_payment")
        .select("*")
        .eq("plan_id", row.id)
        .order("paid_at"),
      row.settlement_attempt_id
        ? supabase
            .from("payment_attempt")
            .select("status")
            .eq("id", row.settlement_attempt_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (lines.error) throw new Error(lines.error.message);
    if (parts.error) throw new Error(parts.error.message);

    const minor = (major: number) =>
      fromMajor(Number(major), row.currency).amountMinor;

    return {
      status: 200,
      data: {
        ...toRow(row, profiles.get(row.user_id)),
        occurrenceId: row.occurrence_id,
        ticketMinor: Number(row.ticket_minor),
        feeMinor: Number(row.fee_minor),
        taxMinor: Number(row.tax_minor),
        keepFeeOnRefund: row.keep_fee_on_refund,
        holdExpiresAt: row.hold_expires_at,
        eventStartsAt: row.event_starts_at,
        endedAt: row.ended_at,
        completedAt: row.completed_at,
        transactionId: row.transaction_id,
        settlementStatus: settlement.data?.status ?? null,
        lines: (
          (lines.data ?? []) as unknown as {
            ticket_type_id: string;
            quantity: number;
            unit_price: number;
            total_price: number;
            ticket_type: { type: string | null } | null;
          }[]
        ).map((l) => ({
          ticketTypeId: l.ticket_type_id,
          ticketTypeName: null,
          tier: l.ticket_type?.type ?? null,
          quantity: Number(l.quantity),
          unitPriceMinor: minor(l.unit_price),
          amountMinor: minor(l.total_price),
        })),
        parts: (parts.data ?? []).map(
          (p): TicketPlanAdminPart => ({
            id: p.id,
            amountMinor: Number(p.amount_minor),
            provider: p.provider,
            providerReference: p.provider_reference,
            method: p.method,
            providerFeeMinor:
              p.provider_fee_minor == null
                ? null
                : Number(p.provider_fee_minor),
            paidAt: p.paid_at,
            refundMinor: Number(p.refund_minor),
            refundStatus: p.refund_status as TicketPlanPartRefundStatus,
            refundAttempts: p.refund_attempts,
            refundRequestedAt: p.refund_requested_at,
            refundProcessedAt: p.refund_processed_at,
            refundFailure: p.refund_failure,
          }),
        ),
      },
    };
  } catch (error) {
    logger.error(`getTicketPlanAdminCore: ${error}`);
    return { status: 500, message: "Couldn't load the plan." };
  }
}

// ── Actions ─────────────────────────────────────────────────────────

/** Ends a running plan with its refund (step-up, checked by the transport). */
export async function endTicketPlanAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: TicketPlanAdminEndInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "plans.manage");
  } catch (e) {
    return denied(e);
  }
  const result = await endTicketPlan(input.planId, "cancelled", "admin");
  if (result.outcome === "busy") {
    return {
      status: 409,
      message:
        "A payment on this plan is being confirmed right now. Try again in a minute.",
    };
  }
  if (result.outcome === "not_open") {
    return { status: 409, message: "This plan has already ended." };
  }
  if (result.outcome === "error") {
    return { status: 500, message: "Couldn't end the plan." };
  }
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "plans.end",
    targetType: "ticket_plan",
    targetId: input.planId,
    summary: `Ended a Pay small small plan; ${result.refundMinor} minor units to refund, ${result.keptMinor} kept`,
    reason: input.reason,
    after: {
      status: result.status,
      refundMinor: result.refundMinor,
      keptMinor: result.keptMinor,
    },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: "Plan ended. Its refund has been started." };
}

/**
 * A refund share the provider refused or never confirmed: ask again, or
 * record that it was refunded by hand. Only after checking the provider's
 * dashboard — asking twice can refund twice.
 */
export async function ticketPlanPartRefundAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: TicketPlanAdminPartRefundInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "plans.manage");
  } catch (e) {
    return denied(e);
  }
  const { data, error } = await supabase.rpc("ticket_plan_admin_part_refund", {
    p_payment_id: input.paymentId,
    p_action: input.action,
    p_note: input.reason,
  });
  if (error) {
    logger.error(`ticketPlanPartRefundAdminCore: ${error.message}`);
    return { status: 500, message: "Couldn't update the refund." };
  }
  const result = (data ?? {}) as {
    changed?: boolean;
    plan_id?: string;
    refund_status?: string;
  };
  if (!result.changed) {
    return {
      status: 409,
      message: "This refund share is not waiting on staff any more.",
    };
  }
  if (input.action === "retry" && result.plan_id) {
    await requestPlannedPlanRefunds({ planId: result.plan_id });
  }
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action:
      input.action === "retry"
        ? "plans.refund.retry"
        : "plans.refund.mark_done",
    targetType: "ticket_plan_payment",
    targetId: input.paymentId,
    summary:
      input.action === "retry"
        ? "Asked the provider again for a Pay small small refund share"
        : "Recorded a Pay small small refund share as refunded by hand",
    reason: input.reason,
    after: { planRefundStatus: result.refund_status ?? null },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return {
    status: 200,
    message:
      input.action === "retry"
        ? "Asked the provider again."
        : "Recorded as refunded.",
  };
}
