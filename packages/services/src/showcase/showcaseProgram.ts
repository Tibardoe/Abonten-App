import { logger } from "@abonten/core/logger";
import { showcaseAudienceIncludes } from "@abonten/core/showcase/rules";
import type { Database } from "@abonten/types/database.types";
import type {
  ShowcaseAudience,
  ShowcaseSettings,
} from "@abonten/types/showcaseType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";

// Programme switch for the "On Abonten" wall: one settings row plus a
// deploy-level kill switch that wins over it, the audience resolved here
// against the user id the transport already proved (auth.uid() is null on
// the service-role client). Fails CLOSED: a kill switch or an off switch
// means nobody sees it, and a read error is reported as such (`failed`), so
// a page can answer 500 instead of pretending the wall is switched off.
//
// Signed-out visitors (userId null) only ever see it when the audience is
// "all". Every read of the wall is made per request (a Server Action, or
// /api/mobile with private, no-store), never cached for others, because the
// tiles carry the viewer's own follow state.

export type ShowcaseSettingRow =
  Database["public"]["Tables"]["showcase_program_setting"]["Row"];

const SETTINGS_TTL_MS = 15_000;
let cached: { row: ShowcaseSettingRow; at: number } | null = null;

/** Emergency stop: the wall hides on this deployment. */
export function isShowcaseKillSwitchOn(): boolean {
  return process.env.SHOWCASE_KILL_SWITCH === "true";
}

/** Test hook: forget the cached settings row. */
export function resetShowcaseSettingsCache(): void {
  cached = null;
}

/** The settings row, or null when it could not be read. */
export async function readShowcaseSettings(
  supabase: ServiceRoleClient,
  options: { fresh?: boolean } = {},
): Promise<ShowcaseSettingRow | null> {
  if (!options.fresh && cached && Date.now() - cached.at < SETTINGS_TTL_MS) {
    return cached.row;
  }
  const { data, error } = await supabase
    .from("showcase_program_setting")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) {
    logger.error(
      `readShowcaseSettings failed: ${error?.message ?? "no settings row"}`,
    );
    // Not cached: the next request tries again.
    return null;
  }
  cached = { row: data, at: Date.now() };
  return data;
}

async function isStaff(
  supabase: ServiceRoleClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("admin_user")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    logger.error(`showcase staff check failed: ${error.message}`);
    return false;
  }
  return data?.status === "active";
}

export type ShowcaseAccess = {
  /** The wall is on for this caller. */
  enabled: boolean;
  /** The answer is the same for everyone (open to all). */
  isPublic: boolean;
  /** The settings could not be read: the answer is unknown, not "off". */
  failed: boolean;
  settings: ShowcaseSettingRow | null;
};

export async function resolveShowcaseAccess(
  supabase: ServiceRoleClient,
  userId: string | null,
): Promise<ShowcaseAccess> {
  if (isShowcaseKillSwitchOn()) {
    return { enabled: false, isPublic: true, failed: false, settings: null };
  }
  const row = await readShowcaseSettings(supabase);
  if (!row) {
    return { enabled: false, isPublic: false, failed: true, settings: null };
  }
  if (!row.enabled) {
    return { enabled: false, isPublic: true, failed: false, settings: row };
  }
  const enabled = await showcaseAudienceIncludes(
    row.audience,
    row.beta_user_ids ?? [],
    userId,
    (id) => isStaff(supabase, id),
  );
  return {
    enabled,
    isPublic: row.audience === "all",
    failed: false,
    settings: row,
  };
}

export function mapShowcaseSettings(row: ShowcaseSettingRow): ShowcaseSettings {
  return {
    enabled: row.enabled,
    audience: row.audience as ShowcaseAudience,
    betaUserIds: row.beta_user_ids ?? [],
    minPerRow: row.min_per_row,
    maxPerRow: row.max_per_row,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}
