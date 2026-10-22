import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import {
  DISABLED_SAFETY_PROGRAM,
  type SafetyAdminSettings,
  type SafetyAudience,
  type SafetyProgram,
} from "@abonten/types/safetyType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";

// Programme switches for Abonten Safety. Same shape as Weekly, Discovery and
// Verification: one settings row plus a deploy-level env kill switch that
// wins over it, with the audience resolved here in TypeScript against the
// user id the transport already proved (auth.uid() is null on the
// service-role client). Fails CLOSED for what it gates: starting a session
// and adding contacts. It never gates a session that is already open —
// switching the programme off must not abandon someone mid-alert, so
// positions, "I'm safe", the dispatcher and the contact page keep working.

export type SafetySettingRow =
  Database["public"]["Tables"]["safety_program_setting"]["Row"];

const SETTINGS_TTL_MS = 15_000;
let cached: { row: SafetySettingRow | null; at: number } | null = null;

/** Emergency stop: the Safety entry points hide on this deployment. */
export function isSafetyKillSwitchOn(): boolean {
  return process.env.SAFETY_KILL_SWITCH === "true";
}

/** Test hook: forget the cached settings row. */
export function resetSafetySettingsCache(): void {
  cached = null;
}

export async function readSafetySettings(
  supabase: ServiceRoleClient,
  options: { fresh?: boolean } = {},
): Promise<SafetySettingRow | null> {
  if (!options.fresh && cached && Date.now() - cached.at < SETTINGS_TTL_MS) {
    return cached.row;
  }
  const { data, error } = await supabase
    .from("safety_program_setting")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    logger.error(`readSafetySettings failed: ${error.message}`);
    return null;
  }
  cached = { row: data ?? null, at: Date.now() };
  return data ?? null;
}

export type SafetyLimits = {
  max_contacts: number;
  alerts_with_sms_per_day: number;
  invites_per_day: number;
  check_in_grace_minutes: number;
  alert_hours: number;
  share_max_hours: number;
};

/** The limits to apply when the row cannot be read (the table's defaults). */
export const DEFAULT_SAFETY_LIMITS: SafetyLimits = {
  max_contacts: 5,
  alerts_with_sms_per_day: 6,
  invites_per_day: 10,
  check_in_grace_minutes: 5,
  alert_hours: 24,
  share_max_hours: 12,
};

export function safetyLimits(row: SafetySettingRow | null): SafetyLimits {
  if (!row) return DEFAULT_SAFETY_LIMITS;
  return {
    max_contacts: row.max_contacts,
    alerts_with_sms_per_day: row.alerts_with_sms_per_day,
    invites_per_day: row.invites_per_day,
    check_in_grace_minutes: row.check_in_grace_minutes,
    alert_hours: row.alert_hours,
    share_max_hours: row.share_max_hours,
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

/** Pure audience rule, exported for tests. */
export async function safetyAudienceIncludes(
  audience: string,
  betaUserIds: string[],
  userId: string | null,
  staffCheck: (userId: string) => Promise<boolean>,
): Promise<boolean> {
  if (!userId) return false;
  if (audience === "all") return true;
  if (audience === "beta" && betaUserIds.includes(userId)) return true;
  return staffCheck(userId);
}

export type SafetyAccess = {
  program: SafetyProgram;
  /** Null when the row could not be read. */
  settings: SafetySettingRow | null;
};

export async function resolveSafetyAccess(
  supabase: ServiceRoleClient,
  userId: string | null,
): Promise<SafetyAccess> {
  if (isSafetyKillSwitchOn()) {
    return { program: DISABLED_SAFETY_PROGRAM, settings: null };
  }
  const row = await readSafetySettings(supabase);
  if (!row || !row.enabled) {
    return { program: DISABLED_SAFETY_PROGRAM, settings: row };
  }
  const enabled = await safetyAudienceIncludes(
    row.audience,
    row.beta_user_ids ?? [],
    userId,
    (id) => isStaff(supabase, id),
  );
  if (!enabled) return { program: DISABLED_SAFETY_PROGRAM, settings: row };
  return {
    settings: row,
    program: {
      enabled: true,
      checkIn: row.check_in_enabled,
      share: row.share_enabled,
      eventTeam: row.event_team_alerts_enabled,
      maxContacts: row.max_contacts,
      checkInGraceMinutes: row.check_in_grace_minutes,
      shareMaxHours: row.share_max_hours,
    },
  };
}

export async function getSafetyProgramCore(
  supabase: ServiceRoleClient,
  userId: string | null,
): Promise<{ status: 200; data: SafetyProgram }> {
  const { program } = await resolveSafetyAccess(supabase, userId);
  return { status: 200, data: program };
}

export function mapSafetySettings(row: SafetySettingRow): SafetyAdminSettings {
  return {
    enabled: row.enabled,
    audience: row.audience as SafetyAudience,
    betaUserIds: row.beta_user_ids ?? [],
    checkInEnabled: row.check_in_enabled,
    shareEnabled: row.share_enabled,
    eventTeamAlertsEnabled: row.event_team_alerts_enabled,
    maxContacts: row.max_contacts,
    alertsWithSmsPerDay: row.alerts_with_sms_per_day,
    invitesPerDay: row.invites_per_day,
    checkInGraceMinutes: row.check_in_grace_minutes,
    alertHours: row.alert_hours,
    shareMaxHours: row.share_max_hours,
    locationRetentionDays: row.location_retention_days,
    sessionRetentionDays: row.session_retention_days,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}
