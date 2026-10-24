import { logger } from "@abonten/core/logger";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type {
  IdentityActorKind,
  IdentityAdminDetail,
  IdentityAdminEvent,
  IdentityAdminMatch,
  IdentityAdminPii,
  IdentityAdminRow,
  IdentityAdminSettings,
  IdentityProviderKey,
  IdentityResultStatus,
  IdentityVerificationStatus,
} from "@abonten/types/identityType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  IdentityAdminDecisionInput,
  IdentityAdminListInput,
  IdentityAdminRevokeInput,
  IdentitySettingsInput,
} from "@abonten/validation/identitySchemas";
import { notifyIdentity } from "../../identity/identityCore";
import {
  isIdentityKillSwitchOn,
  mapIdentitySettings,
  readIdentitySettings,
  resetIdentitySettingsCache,
} from "../../identity/identityProgram";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
  hasPermission,
  recordAdminAudit,
} from "../adminContext";

// Admin › Trust › Identity. Who checked their identity and how it went, the
// review queue (the provider's "attention", duplicates, fraud signals), and
// the settings. The legal name, date of birth and document details are not
// in any list or detail: they are revealed one person at a time with
// identity.view_pii (step-up, checked by the admin transport), and every
// reveal is in the audit log. The images were never Abonten's: staff open
// them in the provider's own portal by the job id.

type Row = Database["public"]["Tables"]["identity_verification"]["Row"];
type RequestMeta = Record<string, unknown> | undefined;

const denied = <T>(e: unknown): AdminEnvelope<T> =>
  adminError(e) as AdminEnvelope<T>;

// ── Settings ────────────────────────────────────────────────────────

export async function getIdentitySettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<
  AdminEnvelope<{ settings: IdentityAdminSettings; killSwitch: boolean }>
> {
  try {
    assertPermission(ctx, "identity.view");
  } catch (e) {
    return denied(e);
  }
  const row = await readIdentitySettings(supabase, { fresh: true }).catch(
    () => null,
  );
  if (!row) return { status: 500, message: "Couldn't load the settings." };
  return {
    status: 200,
    data: {
      settings: mapIdentitySettings(row),
      killSwitch: isIdentityKillSwitchOn(),
    },
  };
}

const COLUMN: Record<keyof IdentitySettingsInput["patch"], string> = {
  enabled: "enabled",
  audience: "audience",
  betaUserIds: "beta_user_ids",
  requireForPayouts: "require_for_payouts",
  requireForPlaceClaims: "require_for_place_claims",
  requireForVerifiedBadges: "require_for_verified_badges",
  requireForPaidEvents: "require_for_paid_events",
  autoApproveClear: "auto_approve_clear",
  attemptsPerDay: "attempts_per_day",
  attemptsPer30Days: "attempts_per_30_days",
  minimumAge: "minimum_age",
  validityMonths: "validity_months",
  linkExpiryHours: "link_expiry_hours",
  retentionDaysUnsuccessful: "retention_days_unsuccessful",
  retentionDaysAfterDeletion: "retention_days_after_deletion",
  retentionDaysFraud: "retention_days_fraud",
};

export async function updateIdentitySettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: IdentitySettingsInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<IdentityAdminSettings>> {
  try {
    assertPermission(ctx, "identity.configure");
  } catch (e) {
    return denied(e);
  }
  const beforeRow = await readIdentitySettings(supabase, { fresh: true }).catch(
    () => null,
  );
  if (!beforeRow)
    return { status: 500, message: "Couldn't load the settings." };
  const before = mapIdentitySettings(beforeRow);

  const update: Record<string, unknown> = {};
  const changed: (keyof IdentityAdminSettings)[] = [];
  for (const [key, value] of Object.entries(input.patch)) {
    const column = COLUMN[key as keyof typeof COLUMN];
    if (!column || value === undefined) continue;
    if (
      JSON.stringify(before[key as keyof IdentityAdminSettings]) ===
      JSON.stringify(value)
    ) {
      continue;
    }
    update[column] = value;
    changed.push(key as keyof IdentityAdminSettings);
  }
  if (changed.length === 0) return { status: 400, message: "Nothing changed." };
  update.updated_at = new Date().toISOString();
  update.updated_by = ctx.userId;

  const { data, error } = await supabase
    .from("identity_program_setting")
    .update(update as never)
    .eq("id", 1)
    .eq("updated_at", input.expectedUpdatedAt)
    .select("*")
    .maybeSingle();
  if (error) {
    logger.error(`updateIdentitySettingsCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't save the settings." };
  }
  if (!data) {
    return {
      status: 409,
      message: "Someone else changed these settings. Reload and try again.",
    };
  }
  resetIdentitySettingsCache();
  const after = mapIdentitySettings(data);
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "identity.settings.update",
    targetType: "identity_program_setting",
    targetId: "1",
    summary: `Identity check settings changed: ${changed.join(", ")}`,
    reason: input.reason,
    before: Object.fromEntries(changed.map((k) => [k, before[k]])),
    after: Object.fromEntries(changed.map((k) => [k, after[k]])),
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: "Settings saved.", data: after };
}

// ── Lists ───────────────────────────────────────────────────────────

async function profilesFor(
  supabase: ServiceRoleClient,
  userIds: string[],
): Promise<
  Map<
    string,
    {
      username: string | null;
      full_name: string | null;
      status_id: number | null;
    }
  >
> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("user_info")
    .select("id, username, full_name, status_id")
    .in("id", ids);
  if (error) throw new Error(error.message);
  return new Map(
    (data ?? []).map((u) => [
      u.id,
      {
        username: (u.username as string | null) ?? null,
        full_name: u.full_name,
        status_id: u.status_id,
      },
    ]),
  );
}

function toRow(
  r: Row,
  profile:
    | {
        username: string | null;
        full_name: string | null;
        status_id: number | null;
      }
    | undefined,
): IdentityAdminRow {
  return {
    id: r.id,
    userId: r.user_id,
    username: profile?.username ?? null,
    displayName: profile?.full_name ?? null,
    accountStatus: profile?.status_id ?? null,
    provider: r.provider as IdentityProviderKey,
    status: r.status as IdentityVerificationStatus,
    documentCountry: r.document_country,
    documentType: r.document_type,
    resultStatus: r.result_status as IdentityResultStatus | null,
    resultReason: r.result_reason,
    riskLevel: r.risk_level,
    fraudDetected: r.fraud_detected,
    matchedAccounts: (r.matched_user_ids ?? []).length,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  };
}

export async function listIdentityVerificationsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: IdentityAdminListInput,
): Promise<
  AdminEnvelope<{
    rows: IdentityAdminRow[];
    counts: { needsReview: number; approved: number; open: number };
  }>
> {
  try {
    assertPermission(ctx, "identity.view");
  } catch (e) {
    return denied(e);
  }
  try {
    let query = supabase
      .from("identity_verification")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(input.limit);
    if (input.status) query = query.eq("status", input.status);
    if (input.userId) query = query.eq("user_id", input.userId);
    if (input.before) query = query.lt("created_at", input.before);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Row[];
    const profiles = await profilesFor(
      supabase,
      rows.map((r) => r.user_id),
    );
    const count = async (statuses: IdentityVerificationStatus[]) => {
      const { count: c, error: e } = await supabase
        .from("identity_verification")
        .select("id", { count: "exact", head: true })
        .in("status", statuses);
      if (e) throw new Error(e.message);
      return c ?? 0;
    };
    const [needsReview, approved, open] = await Promise.all([
      count(["needs_review"]),
      count(["approved"]),
      count(["created", "submitted", "processing"]),
    ]);
    return {
      status: 200,
      data: {
        rows: rows.map((r) => toRow(r, profiles.get(r.user_id))),
        counts: { needsReview, approved, open },
      },
    };
  } catch (error) {
    logger.error(`listIdentityVerificationsCore: ${error}`);
    return { status: 500, message: "Couldn't load identity checks." };
  }
}

async function loadRow(
  supabase: ServiceRoleClient,
  id: string,
): Promise<Row | null> {
  const { data, error } = await supabase
    .from("identity_verification")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Row | null) ?? null;
}

export async function getIdentityVerificationCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  id: string,
): Promise<AdminEnvelope<IdentityAdminDetail>> {
  try {
    assertPermission(ctx, "identity.view");
  } catch (e) {
    return denied(e);
  }
  try {
    const row = await loadRow(supabase, id);
    if (!row) return { status: 404, message: "Identity check not found." };
    const matchedIds = row.matched_user_ids ?? [];
    const [{ data: events, error: eventsError }, profiles, matchRows] =
      await Promise.all([
        supabase
          .from("identity_verification_event")
          .select("kind, from_status, to_status, actor_kind, reason, at")
          .eq("verification_id", id)
          .order("at"),
        profilesFor(supabase, [row.user_id, ...matchedIds]),
        matchedIds.length > 0
          ? supabase
              .from("identity_verification")
              .select("user_id, status, created_at")
              .in("user_id", matchedIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);
    if (eventsError) throw new Error(eventsError.message);
    const latestByUser = new Map<
      string,
      { status: string; revoked: boolean }
    >();
    for (const m of (matchRows.data ?? []) as {
      user_id: string;
      status: string;
    }[]) {
      const seen = latestByUser.get(m.user_id);
      if (!seen) {
        latestByUser.set(m.user_id, {
          status: m.status,
          revoked: m.status === "revoked",
        });
      } else if (m.status === "revoked") {
        seen.revoked = true;
      }
    }
    const matches: IdentityAdminMatch[] = matchedIds.map((uid) => ({
      userId: uid,
      username: profiles.get(uid)?.username ?? null,
      accountStatus: profiles.get(uid)?.status_id ?? null,
      verificationStatus: (latestByUser.get(uid)?.status ??
        "expired") as IdentityVerificationStatus,
      revoked: latestByUser.get(uid)?.revoked ?? false,
    }));
    return {
      status: 200,
      data: {
        ...toRow(row, profiles.get(row.user_id)),
        verificationMethod: row.verification_method,
        providerJobId: row.provider_job_id,
        providerDuplicate: row.provider_duplicate,
        isAdult: row.is_adult,
        decisionSource:
          row.decision_source as IdentityAdminDetail["decisionSource"],
        decisionReason: row.decision_reason,
        validUntil: row.valid_until,
        consentAt: row.consent_at,
        consentNoticeVersion: row.consent_notice_version,
        accountDeletedAt: row.account_deleted_at,
        matches,
        events: (events ?? []).map<IdentityAdminEvent>((e) => ({
          kind: e.kind,
          fromStatus: e.from_status,
          toStatus: e.to_status,
          actorKind: e.actor_kind as IdentityActorKind,
          reason: e.reason,
          at: e.at,
        })),
        pii: null,
      },
    };
  } catch (error) {
    logger.error(`getIdentityVerificationCore: ${error}`);
    return { status: 500, message: "Couldn't load the identity check." };
  }
}

/**
 * The legal name, date of birth and document details of one check, for a
 * reviewer who needs them (a duplicate to settle, a police request). Needs
 * identity.view_pii and a fresh step-up (checked by the transport); every
 * reveal is written to the audit log with the reason given.
 */
export async function revealIdentityPiiCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { verificationId: string; reason: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<IdentityAdminPii>> {
  try {
    assertPermission(ctx, "identity.view_pii");
  } catch (e) {
    return denied(e);
  }
  try {
    const row = await loadRow(supabase, input.verificationId);
    if (!row) return { status: 404, message: "Identity check not found." };
    const profiles = await profilesFor(supabase, [row.user_id]);
    await recordAdminAudit(supabase, {
      actorId: ctx.userId,
      actorRoles: ctx.roles,
      action: "identity.pii.view",
      targetType: "identity_verification",
      targetId: row.id,
      summary: `Identity details viewed for user ${row.user_id}`,
      reason: input.reason,
      requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
    });
    return {
      status: 200,
      data: {
        legalName: row.legal_name,
        dateOfBirth: row.date_of_birth,
        idNumberLast4: row.id_number_last4,
        documentExpiresOn: row.document_expires_on,
        profileName: profiles.get(row.user_id)?.full_name ?? null,
      },
    };
  } catch (error) {
    logger.error(`revealIdentityPiiCore: ${error}`);
    return { status: 500, message: "Couldn't load the details." };
  }
}

// ── Decisions ───────────────────────────────────────────────────────

const TRANSITION_ERRORS: Record<string, { status: number; message: string }> = {
  identity_invalid_transition: {
    status: 409,
    message: "This check has already moved on. Reload to see where it is.",
  },
  identity_reason_required: {
    status: 400,
    message: "Give a reason the person can act on.",
  },
  identity_account_ineligible: {
    status: 409,
    message: "The account is banned or deleted, so it can't be approved.",
  },
};

function transitionError(message: string): AdminEnvelope<never> {
  for (const [key, value] of Object.entries(TRANSITION_ERRORS)) {
    if (message.includes(key)) return value;
  }
  logger.error(`identity transition failed: ${message}`);
  return { status: 500, message: "Couldn't save the decision." };
}

export async function decideIdentityVerificationCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: IdentityAdminDecisionInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ status: IdentityVerificationStatus }>> {
  try {
    assertPermission(ctx, "identity.review");
  } catch (e) {
    return denied(e);
  }
  if (input.decision === "reject" && (input.reason?.trim().length ?? 0) < 5) {
    return { status: 400, message: "Give a reason the person can act on." };
  }
  try {
    const row = await loadRow(supabase, input.verificationId);
    if (!row) return { status: 404, message: "Identity check not found." };
    const { data, error } = await supabase.rpc("identity_transition", {
      p_verification_id: row.id,
      p_action: input.decision,
      p_actor_kind: "staff",
      p_actor_id: ctx.userId,
      ...(input.reason ? { p_reason: input.reason.trim() } : {}),
    });
    if (error) return transitionError(error.message);
    const status = (data as Row | null)?.status as IdentityVerificationStatus;
    await recordAdminAudit(supabase, {
      actorId: ctx.userId,
      actorRoles: ctx.roles,
      action: `identity.${input.decision}`,
      targetType: "identity_verification",
      targetId: row.id,
      summary: `Identity check ${input.decision === "approve" ? "approved" : "rejected"} for user ${row.user_id}`,
      reason: input.reason ?? null,
      before: { status: row.status },
      after: { status },
      requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
    });
    await notifyIdentity(
      supabase,
      row.user_id,
      input.decision === "approve" ? "identity_approved" : "identity_rejected",
      { outcome: input.decision === "approve" ? null : "other" },
    );
    return {
      status: 200,
      message:
        input.decision === "approve"
          ? "Approved."
          : "Rejected. They were told.",
      data: { status },
    };
  } catch (error) {
    logger.error(`decideIdentityVerificationCore: ${error}`);
    return { status: 500, message: "Couldn't save the decision." };
  }
}

export async function revokeIdentityVerificationCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: IdentityAdminRevokeInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ status: IdentityVerificationStatus }>> {
  try {
    assertPermission(ctx, "identity.revoke");
  } catch (e) {
    return denied(e);
  }
  try {
    const row = await loadRow(supabase, input.verificationId);
    if (!row) return { status: 404, message: "Identity check not found." };
    const { data, error } = await supabase.rpc("identity_transition", {
      p_verification_id: row.id,
      p_action: "revoke",
      p_actor_kind: "staff",
      p_actor_id: ctx.userId,
      p_reason: input.reason,
    });
    if (error) return transitionError(error.message);
    await recordAdminAudit(supabase, {
      actorId: ctx.userId,
      actorRoles: ctx.roles,
      action: "identity.revoke",
      targetType: "identity_verification",
      targetId: row.id,
      summary: `Identity verification revoked for user ${row.user_id}`,
      reason: input.reason,
      before: { status: row.status },
      after: { status: "revoked" },
      requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
    });
    await notifyIdentity(supabase, row.user_id, "identity_revoked");
    return {
      status: 200,
      message: "Revoked. They were told.",
      data: {
        status: (data as Row | null)?.status as IdentityVerificationStatus,
      },
    };
  } catch (error) {
    logger.error(`revokeIdentityVerificationCore: ${error}`);
    return { status: 500, message: "Couldn't revoke." };
  }
}

// ── Elsewhere in the console ────────────────────────────────────────

export type IdentityStaffSummary = {
  verified: boolean;
  status: IdentityVerificationStatus | null;
  verificationId: string | null;
};

/**
 * Whether these people's identities are checked, for Admin › Users, the
 * payout screens and Admin › Safety. Status only: no personal details.
 */
export async function identitySummariesCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  userIds: string[],
): Promise<Map<string, IdentityStaffSummary>> {
  const out = new Map<string, IdentityStaffSummary>();
  if (!hasPermission(ctx, "identity.view") || userIds.length === 0) return out;
  const ids = [...new Set(userIds)];
  const [{ data: people }, { data: attempts }] = await Promise.all([
    supabase
      .from("user_info")
      .select(
        "id, identity_verified, identity_valid_until, identity_verification_id, status_id",
      )
      .in("id", ids),
    supabase
      .from("identity_verification")
      .select("id, user_id, status, created_at")
      .in("user_id", ids)
      .order("created_at", { ascending: false }),
  ]);
  const latest = new Map<string, { id: string; status: string }>();
  for (const a of attempts ?? []) {
    if (!latest.has(a.user_id))
      latest.set(a.user_id, { id: a.id, status: a.status });
  }
  for (const p of people ?? []) {
    const verified =
      p.identity_verified &&
      !!p.identity_valid_until &&
      Date.parse(p.identity_valid_until) > Date.now();
    const last = latest.get(p.id);
    out.set(p.id, {
      verified,
      status: (last?.status ?? null) as IdentityVerificationStatus | null,
      verificationId: verified
        ? p.identity_verification_id
        : (last?.id ?? null),
    });
  }
  return out;
}
