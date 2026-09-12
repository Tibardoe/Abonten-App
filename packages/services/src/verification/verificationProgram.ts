import { logger } from "@abonten/core/logger";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  DISABLED_VERIFICATION_PROGRAM,
  type OrganizerType,
  type VerificationProgram,
  type VerificationSubjectType,
} from "@abonten/types/verificationType";

// Programme switches for Trust & Verification, same shape as the Rewards and
// Field Ops gates: one settings row, plus a deploy-level env kill switch that
// wins over it.
//
// Unlike get_rewards_program_public() this is NOT an RPC. Every verification
// core runs on the service-role client, where auth.uid() is null — an
// auth.uid()-based audience check inside SQL would silently resolve "staff"
// and "beta" to nobody. The audience is therefore resolved here, in TypeScript,
// against the user id the transport already proved.

const SETTING_COLUMNS =
  "place_requests_enabled, organizer_requests_enabled, audience, beta_user_ids, organizer_types_enabled, max_evidence_files, max_file_bytes, retention_days_unapproved, retention_days_after_revoke, draft_expiry_days";

export type VerificationSettingRow = {
  place_requests_enabled: boolean;
  organizer_requests_enabled: boolean;
  audience: "staff" | "beta" | "all";
  beta_user_ids: string[];
  organizer_types_enabled: string[];
  max_evidence_files: number;
  max_file_bytes: number;
  retention_days_unapproved: number;
  retention_days_after_revoke: number;
  draft_expiry_days: number;
};

/**
 * Deploy-level emergency stop, mirroring REWARDS_KILL_SWITCH and
 * FIELD_OPS_KILL_SWITCH. When set to "true" on the web and admin
 * deployments, no new request can be started or submitted and the
 * verification UI hides itself. It never touches data: places and organizers
 * that are already verified keep their badge.
 */
export function isVerificationKillSwitchOn(): boolean {
  return process.env.VERIFICATION_KILL_SWITCH === "true";
}

export async function readVerificationSettings(
  supabase: ServiceRoleClient,
): Promise<VerificationSettingRow | null> {
  const { data, error } = await supabase
    .from("verification_program_setting")
    .select(SETTING_COLUMNS)
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    logger.error(`readVerificationSettings failed: ${error.message}`);
    return null;
  }
  return (data as VerificationSettingRow | null) ?? null;
}

async function isStaff(
  supabase: ServiceRoleClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("admin_user")
    .select("user_id, status")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.status === "active";
}

/**
 * Resolves the programme as one caller sees it. Fails CLOSED: any error, a
 * missing settings row or the kill switch all yield the all-off programme,
 * so a database hiccup can never accidentally open submissions.
 */
export async function getVerificationProgramCore(
  supabase: ServiceRoleClient,
  userId: string | null,
): Promise<VerificationProgram> {
  if (isVerificationKillSwitchOn()) return DISABLED_VERIFICATION_PROGRAM;

  const row = await readVerificationSettings(supabase);
  if (!row) return DISABLED_VERIFICATION_PROGRAM;

  const organizerTypes = (row.organizer_types_enabled ?? []).filter(
    (t): t is OrganizerType =>
      t === "individual" || t === "business" || t === "organisation",
  );
  const limits = {
    organizerTypes,
    maxEvidenceFiles: row.max_evidence_files,
    maxFileBytes: row.max_file_bytes,
  };
  const off = {
    ...DISABLED_VERIFICATION_PROGRAM,
    ...limits,
    organizerTypes: [] as OrganizerType[],
  };

  if (!userId) return off;

  let inAudience: boolean;
  if (row.audience === "all") {
    inAudience = true;
  } else if (row.audience === "beta") {
    inAudience =
      (row.beta_user_ids ?? []).includes(userId) ||
      (await isStaff(supabase, userId));
  } else {
    inAudience = await isStaff(supabase, userId);
  }
  if (!inAudience) return off;

  return {
    ...limits,
    placeRequestsEnabled: row.place_requests_enabled,
    organizerRequestsEnabled: row.organizer_requests_enabled,
  };
}

export function requestsEnabledFor(
  program: VerificationProgram,
  subjectType: VerificationSubjectType,
): boolean {
  return subjectType === "place"
    ? program.placeRequestsEnabled
    : program.organizerRequestsEnabled;
}
