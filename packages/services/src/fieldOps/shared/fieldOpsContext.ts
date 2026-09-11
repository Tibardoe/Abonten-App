import { logger } from "@abonten/core/logger";
import type {
  FieldOpsCampaignStatus,
  FieldOpsMemberRole,
  FieldOpsMembership,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { isFieldOpsKillSwitchOn } from "./killSwitch";

// The authorization primitive for every member / team-lead Field Ops
// service (the counterpart of resolveAdminContext for admins). The
// transport resolves the caller's user id from its session, then the
// service re-derives the caller's memberships from the database on every
// call -- a suspended member, or a campaign that was paused, is reflected
// immediately. Nothing the client sends about roles is ever trusted.

export type FieldOpsContext = {
  userId: string;
  /** Whether the programme is on at all (settings row + kill switch). */
  programEnabled: boolean;
  memberships: FieldOpsMembership[];
};

export class FieldOpsForbiddenError extends Error {
  readonly status: 403 | 404;
  constructor(message: string, status: 403 | 404 = 403) {
    super(message);
    this.name = "FieldOpsForbiddenError";
    this.status = status;
  }
}

type MembershipRow = {
  membership_id: string;
  campaign_id: string;
  team_id: string;
  region_id: string;
  role: string;
  status: string;
  campaign_status: string;
  campaign_name: string;
  currency: string;
  joined_at: string | null;
};

export async function resolveFieldOpsContext(
  serviceClient: ServiceRoleClient,
  userId: string | null | undefined,
): Promise<FieldOpsContext> {
  if (!userId) throw new FieldOpsForbiddenError("Not signed in", 403);

  const [{ data: enabled, error: enabledError }, { data: rows, error }] =
    await Promise.all([
      serviceClient.rpc("fieldops_program_enabled"),
      serviceClient.rpc("fieldops_memberships_for", { p_user_id: userId }),
    ]);

  if (enabledError) {
    logger.error(
      `resolveFieldOpsContext: program flag read failed: ${enabledError.message}`,
    );
  }
  if (error) {
    logger.error(
      `resolveFieldOpsContext: membership lookup failed: ${error.message}`,
    );
    throw new FieldOpsForbiddenError("Could not verify your team membership");
  }

  const memberships = ((rows ?? []) as MembershipRow[]).map((r) => ({
    membershipId: r.membership_id,
    campaignId: r.campaign_id,
    teamId: r.team_id,
    regionId: r.region_id,
    role: r.role as FieldOpsMemberRole,
    status: r.status as "active" | "suspended",
    campaignStatus: r.campaign_status as FieldOpsCampaignStatus,
    campaignName: r.campaign_name,
    currency: r.currency,
    joinedAt: r.joined_at,
  }));

  return {
    userId,
    programEnabled: enabled === true && !isFieldOpsKillSwitchOn(),
    memberships,
  };
}

/**
 * The caller's ACTIVE membership in a campaign, or a 403. Pass `roles` to
 * require a specific role (e.g. the team lead) on top.
 */
export function requireMembership(
  ctx: FieldOpsContext,
  campaignId: string,
  roles?: readonly FieldOpsMemberRole[],
): FieldOpsMembership {
  if (!ctx.programEnabled) {
    throw new FieldOpsForbiddenError("The programme is switched off", 404);
  }
  const m = ctx.memberships.find((x) => x.campaignId === campaignId);
  if (!m || m.status !== "active") {
    throw new FieldOpsForbiddenError("You are not on this campaign's team");
  }
  if (roles && !roles.includes(m.role)) {
    throw new FieldOpsForbiddenError("Your role can't do this");
  }
  return m;
}

/** Maps a thrown FieldOpsForbiddenError (or anything else) to an envelope. */
export function fieldOpsError(err: unknown): {
  status: number;
  message: string;
} {
  if (err instanceof FieldOpsForbiddenError) {
    return { status: err.status, message: err.message };
  }
  logger.error("Unhandled Field Ops service error", err);
  return { status: 500, message: "Something went wrong" };
}
