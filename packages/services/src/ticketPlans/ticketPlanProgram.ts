import { logger } from "@abonten/core/logger";
import { DEFAULT_TICKET_PLAN_RULES } from "@abonten/core/ticketPlans/rules";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  TicketPlanAdminSettings,
  TicketPlanAudience,
  TicketPlanNav,
  TicketPlanProgram,
  TicketPlanRules,
} from "@abonten/types/ticketPlanType";

// Programme switches for Pay small small. Same shape as Safety and Identity:
// one settings row plus a deploy-level kill switch that wins over it, the
// audience resolved here against the user id the transport already proved.
//
// What each switch stops:
//   * `enabled` off, or a person outside the audience: no NEW plan can
//     start and organizers cannot switch plans on. Plans already running
//     keep working (parts, cancelling, refunds) — switching the programme
//     off must never strand someone's money or seats.
//   * TICKET_PLANS_KILL_SWITCH (an emergency stop for a fault in the plan
//     payments): no new plan and no new part either. Running plans can still
//     be read and cancelled, and the job keeps ending and refunding them.

export type TicketPlanSettingRow =
  Database["public"]["Tables"]["ticket_plan_program_setting"]["Row"];

const SETTINGS_TTL_MS = 15_000;
let cached: { row: TicketPlanSettingRow | null; at: number } | null = null;

export function isTicketPlansKillSwitchOn(): boolean {
  return process.env.TICKET_PLANS_KILL_SWITCH === "true";
}

/** Test hook: forget the cached settings row. */
export function resetTicketPlanSettingsCache(): void {
  cached = null;
}

export async function readTicketPlanSettings(
  supabase: ServiceRoleClient,
  options: { fresh?: boolean } = {},
): Promise<TicketPlanSettingRow | null> {
  if (!options.fresh && cached && Date.now() - cached.at < SETTINGS_TTL_MS) {
    return cached.row;
  }
  const { data, error } = await supabase
    .from("ticket_plan_program_setting")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    logger.error(`readTicketPlanSettings failed: ${error.message}`);
    return null;
  }
  cached = { row: data ?? null, at: Date.now() };
  return data ?? null;
}

export function ticketPlanRules(
  row: TicketPlanSettingRow | null,
): TicketPlanRules {
  if (!row) return DEFAULT_TICKET_PLAN_RULES;
  return {
    firstPartMinBps: row.first_part_min_bps,
    partMinBps: row.part_min_bps,
    deadlineHoursBeforeStart: row.deadline_hours_before_start,
    minDaysToDeadline: row.min_days_to_deadline,
    holdMinutes: row.hold_minutes,
    maxTicketsPerPlan: row.max_tickets_per_plan,
    keepFeeOnRefund: row.keep_fee_on_refund,
    reminderDays: [...(row.reminder_days ?? [])].sort((a, b) => b - a),
  };
}

async function isStaff(
  supabase: ServiceRoleClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("admin_user")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.status === "active";
}

/**
 * Pure audience rule, exported for tests. With audience "all" a signed-out
 * visitor sees the offer too (starting a plan still needs an account).
 */
export async function ticketPlanAudienceIncludes(
  audience: string,
  betaUserIds: string[],
  userId: string | null,
  staffCheck: (userId: string) => Promise<boolean>,
): Promise<boolean> {
  if (audience === "all") return true;
  if (!userId) return false;
  if (audience === "beta" && betaUserIds.includes(userId)) return true;
  return staffCheck(userId);
}

export type TicketPlanAccess = {
  program: TicketPlanProgram;
  /** Null when the row could not be read. */
  settings: TicketPlanSettingRow | null;
};

export async function resolveTicketPlanAccess(
  supabase: ServiceRoleClient,
  userId: string | null,
): Promise<TicketPlanAccess> {
  const disabled = (row: TicketPlanSettingRow | null): TicketPlanAccess => ({
    program: { enabled: false, rules: ticketPlanRules(row) },
    settings: row,
  });
  if (isTicketPlansKillSwitchOn()) return disabled(null);
  const row = await readTicketPlanSettings(supabase);
  if (!row || !row.enabled) return disabled(row);
  const enabled = await ticketPlanAudienceIncludes(
    row.audience,
    row.beta_user_ids ?? [],
    userId,
    (id) => isStaff(supabase, id),
  );
  if (!enabled) return disabled(row);
  return {
    settings: row,
    program: { enabled: true, rules: ticketPlanRules(row) },
  };
}

export async function getTicketPlanProgramCore(
  supabase: ServiceRoleClient,
  userId: string | null,
): Promise<{ status: 200; data: TicketPlanProgram }> {
  const { program } = await resolveTicketPlanAccess(supabase, userId);
  return { status: 200, data: program };
}

export function mapTicketPlanSettings(
  row: TicketPlanSettingRow,
): TicketPlanAdminSettings {
  return {
    ...ticketPlanRules(row),
    enabled: row.enabled,
    audience: row.audience as TicketPlanAudience,
    betaUserIds: row.beta_user_ids ?? [],
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * What the header asks: whether the person may start plans, and how many
 * they have running (the Balance link shows for either).
 */
export async function getTicketPlanNavCore(
  supabase: ServiceRoleClient,
  userId: string | null,
): Promise<{ status: 200; data: TicketPlanNav }> {
  const { program } = await resolveTicketPlanAccess(supabase, userId);
  let openPlans = 0;
  if (userId) {
    const { count, error } = await supabase
      .from("ticket_plan")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["awaiting_payment", "active", "settling"]);
    if (error) logger.error(`getTicketPlanNavCore: ${error.message}`);
    openPlans = count ?? 0;
  }
  return { status: 200, data: { enabled: program.enabled, openPlans } };
}
