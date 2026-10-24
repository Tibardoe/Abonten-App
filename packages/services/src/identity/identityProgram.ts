import type { Database } from "@abonten/types/database.types";
import {
  DISABLED_IDENTITY_PROGRAM,
  type IdentityAdminSettings,
  type IdentityAudience,
  type IdentityProgram,
  type IdentityPurpose,
} from "@abonten/types/identityType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";

// Programme switches for identity checks, the same shape as Safety and
// Verification: one settings row plus a deploy-level kill switch that wins
// over it, with the audience resolved here against the user id the
// transport proved. Fails CLOSED for starting a check. A requirement (no
// payout without a verified identity, and so on) applies only to people the
// programme is open to: with the audience on staff, only staff are held to
// it, so switching a requirement on never blocks someone who has no way to
// verify.

export type IdentitySettingRow =
  Database["public"]["Tables"]["identity_program_setting"]["Row"];

const SETTINGS_TTL_MS = 15_000;
let cached: { row: IdentitySettingRow | null; at: number } | null = null;

/** Emergency stop: no new check starts and the entry points hide. */
export function isIdentityKillSwitchOn(): boolean {
  return process.env.IDENTITY_KILL_SWITCH === "true";
}

/** Test hook: forget the cached settings row. */
export function resetIdentitySettingsCache(): void {
  cached = null;
}

export async function readIdentitySettings(
  supabase: ServiceRoleClient,
  options: { fresh?: boolean } = {},
): Promise<IdentitySettingRow | null> {
  if (!options.fresh && cached && Date.now() - cached.at < SETTINGS_TTL_MS) {
    return cached.row;
  }
  const { data, error } = await supabase
    .from("identity_program_setting")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  // A failed read throws rather than reading as "switched off": the
  // requirements are money and trust gates, and must not open on a blip.
  if (error) throw new Error(`readIdentitySettings: ${error.message}`);
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

/** What a verified identity is required for, as the row says. */
export function identityRequirements(
  row: IdentitySettingRow | null,
): IdentityPurpose[] {
  if (!row || !row.enabled) return [];
  const out: IdentityPurpose[] = [];
  if (row.require_for_payouts) out.push("payouts");
  if (row.require_for_place_claims) out.push("place_claims");
  if (row.require_for_verified_badges) out.push("verified_badges");
  if (row.require_for_paid_events) out.push("paid_events");
  return out;
}

export type IdentityAccess = {
  program: IdentityProgram;
  settings: IdentitySettingRow | null;
};

export async function resolveIdentityAccess(
  supabase: ServiceRoleClient,
  userId: string | null,
): Promise<IdentityAccess> {
  if (isIdentityKillSwitchOn()) {
    return { program: DISABLED_IDENTITY_PROGRAM, settings: null };
  }
  const row = await readIdentitySettings(supabase);
  if (!row || !row.enabled || !userId) {
    return { program: DISABLED_IDENTITY_PROGRAM, settings: row };
  }
  let inAudience = row.audience === "all";
  if (!inAudience && row.audience === "beta") {
    inAudience = (row.beta_user_ids ?? []).includes(userId);
  }
  if (!inAudience) inAudience = await isStaff(supabase, userId);
  if (!inAudience) {
    return { program: DISABLED_IDENTITY_PROGRAM, settings: row };
  }
  return {
    settings: row,
    program: {
      enabled: true,
      requiredFor: identityRequirements(row),
      minimumAge: row.minimum_age,
    },
  };
}

export function mapIdentitySettings(
  row: IdentitySettingRow,
): IdentityAdminSettings {
  return {
    enabled: row.enabled,
    audience: row.audience as IdentityAudience,
    betaUserIds: row.beta_user_ids ?? [],
    requireForPayouts: row.require_for_payouts,
    requireForPlaceClaims: row.require_for_place_claims,
    requireForVerifiedBadges: row.require_for_verified_badges,
    requireForPaidEvents: row.require_for_paid_events,
    autoApproveClear: row.auto_approve_clear,
    attemptsPerDay: row.attempts_per_day,
    attemptsPer30Days: row.attempts_per_30_days,
    minimumAge: row.minimum_age,
    validityMonths: row.validity_months,
    linkExpiryHours: row.link_expiry_hours,
    retentionDaysUnsuccessful: row.retention_days_unsuccessful,
    retentionDaysAfterDeletion: row.retention_days_after_deletion,
    retentionDaysFraud: row.retention_days_fraud,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}
