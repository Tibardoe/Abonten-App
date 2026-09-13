import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import {
  DISABLED_DISCOVERY_PROGRAM,
  type DiscoveryAudience,
  type DiscoveryProgram,
  type DiscoverySettings,
} from "@abonten/types/discoveryType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";

// Programme switches for Discovery (unified search, recommendation
// notifications, opt-in prompts). Same shape as Rewards, Field Ops and
// Verification: one settings row plus deploy-level env kill switches that
// win over it, audience resolved here in TypeScript against the user id the
// transport already proved (auth.uid() is null on the service-role client).
//
// The settings row is read on every search, so it is cached per server
// instance for a few seconds. A switch flipped in the admin console reaches
// every instance within SETTINGS_TTL_MS; the env kill switches apply at once.

export type DiscoverySettingRow =
  Database["public"]["Tables"]["discovery_program_setting"]["Row"];

const SETTINGS_TTL_MS = 15_000;
let cached: { row: DiscoverySettingRow | null; at: number } | null = null;

/** Emergency stop for unified search: every surface falls back to the old search. */
export function isSearchKillSwitchOn(): boolean {
  return process.env.SEARCH_V2_KILL_SWITCH === "true";
}

/**
 * Emergency stop for personalisation: no prompts, no new subscriptions, no
 * For-you list. The database jobs are stopped separately with
 * discovery_program_setting.recommendations_enabled (the delivery claim
 * also skips queued recommendation pushes when that is off).
 */
export function isRecommendationsKillSwitchOn(): boolean {
  return process.env.RECOMMENDATIONS_KILL_SWITCH === "true";
}

/** Test hook: forget the cached settings row. */
export function resetDiscoverySettingsCache(): void {
  cached = null;
}

export async function readDiscoverySettings(
  supabase: ServiceRoleClient,
  options: { fresh?: boolean } = {},
): Promise<DiscoverySettingRow | null> {
  if (!options.fresh && cached && Date.now() - cached.at < SETTINGS_TTL_MS) {
    return cached.row;
  }
  const { data, error } = await supabase
    .from("discovery_program_setting")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    logger.error(`readDiscoverySettings failed: ${error.message}`);
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

async function inAudience(
  supabase: ServiceRoleClient,
  audience: string,
  betaUserIds: string[],
  userId: string | null,
  staff: { value: boolean | null },
): Promise<boolean> {
  if (audience === "all") return true;
  if (!userId) return false;
  if (audience === "beta" && betaUserIds.includes(userId)) return true;
  if (staff.value === null) staff.value = await isStaff(supabase, userId);
  return staff.value;
}

export type DiscoveryAccess = {
  program: DiscoveryProgram;
  /** Null when the row could not be read (everything is then off). */
  settings: DiscoverySettingRow | null;
};

/**
 * What one caller (or an anonymous visitor, userId null) may use. Fails
 * CLOSED: a kill switch, a missing row or a read error turns the feature off.
 */
export async function resolveDiscoveryAccess(
  supabase: ServiceRoleClient,
  userId: string | null,
): Promise<DiscoveryAccess> {
  const row = await readDiscoverySettings(supabase);
  if (!row) return { program: DISABLED_DISCOVERY_PROGRAM, settings: null };

  const staff = { value: null as boolean | null };
  const beta = row.beta_user_ids ?? [];

  const searchV2 =
    !isSearchKillSwitchOn() &&
    row.search_v2_enabled &&
    (await inAudience(supabase, row.search_audience, beta, userId, staff));

  const personalization =
    !isRecommendationsKillSwitchOn() &&
    !!userId &&
    row.recommendations_enabled &&
    (await inAudience(
      supabase,
      row.recommendations_audience,
      beta,
      userId,
      staff,
    ));

  return {
    settings: row,
    program: {
      searchV2,
      organizerSearch: searchV2 && row.organizer_search_enabled,
      placeSearch: searchV2 && row.place_search_enabled,
      personalization,
      prompts: personalization && row.prompts_enabled,
    },
  };
}

export async function getDiscoveryProgramCore(
  supabase: ServiceRoleClient,
  userId: string | null,
): Promise<{ status: 200; data: DiscoveryProgram }> {
  const { program } = await resolveDiscoveryAccess(supabase, userId);
  return { status: 200, data: program };
}

export function mapDiscoverySettings(
  row: DiscoverySettingRow,
): DiscoverySettings {
  return {
    searchV2Enabled: row.search_v2_enabled,
    searchAudience: row.search_audience as DiscoveryAudience,
    organizerSearchEnabled: row.organizer_search_enabled,
    placeSearchEnabled: row.place_search_enabled,
    searchLoggingEnabled: row.search_logging_enabled,
    searchLogRetentionDays: row.search_log_retention_days,
    recommendationsEnabled: row.recommendations_enabled,
    recommendationsShadowMode: row.recommendations_shadow_mode,
    recommendationsAudience: row.recommendations_audience as DiscoveryAudience,
    promptsEnabled: row.prompts_enabled,
    betaUserIds: row.beta_user_ids ?? [],
    dailyPushCap: row.daily_push_cap,
    weeklyPushCap: row.weekly_push_cap,
    organizerCooldownHours: row.organizer_cooldown_hours,
    similarDefaultRadiusKm: Number(row.similar_default_radius_km),
    candidateTtlDays: row.candidate_ttl_days,
    ignorePauseAfter: row.ignore_pause_after,
    ignorePauseDays: row.ignore_pause_days,
    digestHourLocal: row.digest_hour_local,
    promptCooldownDays: row.prompt_cooldown_days,
    promptDismissDays: row.prompt_dismiss_days,
    promptMaxShows: row.prompt_max_shows,
    recommendationRetentionDays: row.recommendation_retention_days,
    generateWatermark: row.generate_watermark,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}
