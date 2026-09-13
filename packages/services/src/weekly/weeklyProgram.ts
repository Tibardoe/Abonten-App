import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  DISABLED_WEEKLY_PROGRAM,
  type WeeklyAudience,
  type WeeklyProgram,
  type WeeklySettings,
} from "@abonten/types/weeklyType";

// Programme switches for Abonten Weekly. Same shape as Discovery, Rewards and
// Verification: one settings row plus a deploy-level env kill switch that
// wins over it, with the audience resolved here in TypeScript against the
// user id the transport already proved (auth.uid() is null on the
// service-role client). Fails CLOSED: a kill switch, a missing row or a read
// error means nobody sees Abonten Weekly.
//
// Anonymous visitors (userId null) only ever see it when the audience is
// "all". That is what lets the public /weekly pages be cached for everyone:
// while the audience is staff or beta, the cached page carries no edition and
// signed-in staff and beta testers load it through a session-aware request.

export type WeeklySettingRow =
  Database["public"]["Tables"]["weekly_program_setting"]["Row"];

const SETTINGS_TTL_MS = 15_000;
let cached: { row: WeeklySettingRow | null; at: number } | null = null;

/** Emergency stop: every Abonten Weekly surface hides on this deployment. */
export function isWeeklyKillSwitchOn(): boolean {
  return process.env.WEEKLY_KILL_SWITCH === "true";
}

/** Test hook: forget the cached settings row. */
export function resetWeeklySettingsCache(): void {
  cached = null;
}

export async function readWeeklySettings(
  supabase: ServiceRoleClient,
  options: { fresh?: boolean } = {},
): Promise<WeeklySettingRow | null> {
  if (!options.fresh && cached && Date.now() - cached.at < SETTINGS_TTL_MS) {
    return cached.row;
  }
  const { data, error } = await supabase
    .from("weekly_program_setting")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    logger.error(`readWeeklySettings failed: ${error.message}`);
    // Do not cache a failure: the next request tries again.
    return null;
  }
  cached = { row: data ?? null, at: Date.now() };
  return data ?? null;
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
export async function weeklyAudienceIncludes(
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

export type WeeklyAccess = {
  program: WeeklyProgram;
  /** Null when the row could not be read (everything is then off). */
  settings: WeeklySettingRow | null;
  /** True when the answer does not depend on who is asking (audience all). */
  isPublic: boolean;
};

export async function resolveWeeklyAccess(
  supabase: ServiceRoleClient,
  userId: string | null,
): Promise<WeeklyAccess> {
  if (isWeeklyKillSwitchOn()) {
    return { program: DISABLED_WEEKLY_PROGRAM, settings: null, isPublic: true };
  }
  const row = await readWeeklySettings(supabase);
  if (!row || !row.enabled) {
    return { program: DISABLED_WEEKLY_PROGRAM, settings: row, isPublic: true };
  }
  const enabled = await weeklyAudienceIncludes(
    row.audience,
    row.beta_user_ids ?? [],
    userId,
    (id) => isStaff(supabase, id),
  );
  return {
    settings: row,
    isPublic: row.audience === "all",
    program: { enabled, teaser: enabled && row.teaser_enabled },
  };
}

export async function getWeeklyProgramCore(
  supabase: ServiceRoleClient,
  userId: string | null,
): Promise<{ status: 200; data: WeeklyProgram }> {
  const { program } = await resolveWeeklyAccess(supabase, userId);
  return { status: 200, data: program };
}

export function mapWeeklySettings(row: WeeklySettingRow): WeeklySettings {
  return {
    enabled: row.enabled,
    audience: row.audience as WeeklyAudience,
    betaUserIds: row.beta_user_ids ?? [],
    teaserEnabled: row.teaser_enabled,
    defaultPublishHourLocal: row.default_publish_hour_local,
    maxItemsPerSection: row.max_items_per_section,
    maxPerOrganizerPerSection: row.max_per_organizer_per_section,
    exposureLookbackEditions: row.exposure_lookback_editions,
    editionRetentionWeeks: row.edition_retention_weeks,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}
