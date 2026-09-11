import { logger } from "@abonten/core/logger";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { FieldOpsProgramSettings } from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  type AdminEnvelope,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";
import {
  type RequestMeta,
  type SettingsRow,
  denied,
  mapSettings,
  readSettings,
} from "./fieldOpsAdminShared";

// Admin > Field Ops > Settings. Same shape as updateRewardsSettingsCore:
// only changed fields are written and audited, and expectedUpdatedAt makes
// two admins editing at once fail loudly instead of overwriting each other.

export async function getFieldOpsSettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<AdminEnvelope<FieldOpsProgramSettings>> {
  try {
    assertPermission(ctx, "fieldops.view");
  } catch (e) {
    return denied(e);
  }
  const settings = await readSettings(supabase);
  if (!settings) return { status: 500, message: "Something went wrong" };
  return { status: 200, data: settings };
}

export type FieldOpsSettingsPatch = Partial<
  Omit<FieldOpsProgramSettings, "updatedAt" | "updatedBy">
>;

const SETTINGS_COLUMN: Record<keyof FieldOpsSettingsPatch, string> = {
  programEnabled: "program_enabled",
  workerUiEnabled: "worker_ui_enabled",
  commissionGenerationEnabled: "commission_generation_enabled",
  payoutsEnabled: "payouts_enabled",
  requireMemberPhoneVerified: "require_member_phone_verified",
  defaultHoldingDays: "default_holding_days",
  duplicateRadiusM: "duplicate_radius_m",
  duplicateNameSimilarity: "duplicate_name_similarity",
  offlineMaxDistanceM: "offline_max_distance_m",
  dailySubmissionCap: "daily_submission_cap",
  spotCheckBps: "spot_check_bps",
  reviewGraceDays: "review_grace_days",
  evidenceRetentionDays: "evidence_retention_days",
  notifyPushEnabled: "notify_push_enabled",
};

// Switches whose behaviour hasn't shipped yet are refused server-side so a
// crafted request can't turn on half-built behaviour. Remove a key when its
// phase ships: the worker UI switch shipped with Phase 1 (/field honours
// it), commission generation with Phase 3 (the sweep reads it), payouts are
// still Phase 4.
const UNSHIPPED_SETTINGS = new Set<keyof FieldOpsSettingsPatch>([
  "payoutsEnabled",
]);

export async function updateFieldOpsSettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    patch: FieldOpsSettingsPatch;
    expectedUpdatedAt: string;
    reason: string;
  },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<FieldOpsProgramSettings>> {
  try {
    assertPermission(ctx, "fieldops.manage");
  } catch (e) {
    return denied(e);
  }

  const before = await readSettings(supabase);
  if (!before) return { status: 500, message: "Something went wrong" };

  const update: Record<string, unknown> = {};
  const changed: string[] = [];
  for (const [key, value] of Object.entries(input.patch)) {
    const column = SETTINGS_COLUMN[key as keyof FieldOpsSettingsPatch];
    const previous = before[key as keyof FieldOpsProgramSettings];
    if (!column || value === undefined) continue;
    if (JSON.stringify(previous) === JSON.stringify(value)) continue;
    update[column] = value;
    changed.push(key);
  }
  if (changed.length === 0) {
    return { status: 400, message: "Nothing changed." };
  }
  const unshipped = changed.filter((key) =>
    UNSHIPPED_SETTINGS.has(key as keyof FieldOpsSettingsPatch),
  );
  if (unshipped.length > 0) {
    return {
      status: 409,
      message: `These switches control parts of the programme that haven't shipped yet: ${unshipped.join(", ")}.`,
    };
  }
  update.updated_at = new Date().toISOString();
  update.updated_by = ctx.userId;

  const { data, error } = await supabase
    .from("fieldops_program_setting")
    .update(update as never)
    .eq("id", 1)
    .eq("updated_at", input.expectedUpdatedAt)
    .select("*")
    .maybeSingle();

  if (error) {
    logger.error(`updateFieldOpsSettingsCore failed: ${error.message}`);
    return { status: 400, message: error.message };
  }
  if (!data) {
    return {
      status: 409,
      message: "Someone else changed these settings. Reload and try again.",
    };
  }

  const after = mapSettings(data as unknown as SettingsRow);
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "fieldops.settings.update",
    targetType: "fieldops_program_setting",
    targetId: "1",
    summary: `Field Ops settings changed: ${changed.join(", ")}`,
    reason: input.reason,
    before: Object.fromEntries(
      changed.map((k) => [k, before[k as keyof FieldOpsProgramSettings]]),
    ),
    after: Object.fromEntries(
      changed.map((k) => [k, after[k as keyof FieldOpsProgramSettings]]),
    ),
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return { status: 200, message: "Settings saved.", data: after };
}
