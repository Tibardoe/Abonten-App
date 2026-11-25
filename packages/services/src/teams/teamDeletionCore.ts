import { logger } from "@abonten/core/logger";
import {
  TEAM_DELETE_REQUEST_DAYS,
  teamNameConfirmed,
} from "@abonten/core/teams/teamDeletion";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { TeamDeletionOutcome } from "@abonten/types/teamType";
import { tr } from "../i18n/requestLocale";
import {
  isAccountRestricted,
  restrictedAccountMessage,
} from "../security/accountStatus";
import { type TeamFail, activeMembership, failFromDb } from "./teamCore";
import { isFreshSignIn } from "./teamMoney";
import {
  noticeTeamDeleteCancelled,
  noticeTeamDeleteRequested,
  noticeTeamDeleted,
} from "./teamNotices";
import { isTeamsKillSwitchOn } from "./teamProgram";

// Deleting a team (docs/architecture/team-accounts.md §4o). The founder's
// rule (2026-11-25): every active Owner agrees. An Owner asks (typing the
// team's name, after a fresh sign-in); every other Owner approves on the
// team page (each after a fresh sign-in); any Owner may stop it. A request
// ends by itself after 7 days, when the Owners change, or when something
// now stops the deletion. The database keeps every rule under the team's
// row lock (public.team_delete_request / _approve / _cancel / _finish);
// this layer adds the kill switch, the person's own standing, the fresh
// sign-in, the typed name and the words of what stops it, then does what
// the database cannot: soft-deletes the team's auth user and tells every
// member in their own language.
//
// What deleting does is a person's account deletion applied to the team
// (credit closed, anonymize_deleted_account: events cancelled or archived,
// places unclaimed, payout accounts scrubbed, verification withdrawn,
// follows and alerts ended, conversations closed, profile scrubbed), then:
// invitations withdrawn, every member removed, the team closed. Nothing is
// hard-deleted: sales, payouts and the ledger stay as the financial record.

type Fail = TeamFail;
type Ok<T> = { status: 200; message?: string; data: T };

/** What stops a deletion: counts from public.team_deletion_blockers. */
export type TeamDeletionBlockers = {
  upcoming_events_with_attendees: number | string;
  payouts_in_flight: number | string;
  balance_owed: number | string;
  seats_held: number | string;
  payments_in_progress: number | string;
  promotions_running: number | string;
  owners_changed_recently: number | string;
};

/**
 * The first thing to do before the team can be deleted, as a message key,
 * or null when nothing stops it. Staff are not bound by the Owners'
 * seven-day rule.
 */
export function teamDeletionBlockerKey(
  b: TeamDeletionBlockers,
  options: { staff?: boolean } = {},
): string | null {
  if (Number(b.upcoming_events_with_attendees) > 0) {
    return "teamDeleteBlockedEvents";
  }
  if (Number(b.seats_held) > 0) return "teamDeleteBlockedPlans";
  if (Number(b.payouts_in_flight) > 0) return "teamDeleteBlockedPayout";
  if (Number(b.balance_owed) > 0.005) return "teamDeleteBlockedBalance";
  if (Number(b.payments_in_progress) > 0) return "teamDeleteBlockedPayments";
  if (Number(b.promotions_running) > 0) return "teamDeleteBlockedPromotion";
  if (!options.staff && Number(b.owners_changed_recently) > 0) {
    return "teamDeleteBlockedOwnersChanged";
  }
  return null;
}

/** The counts, or null when they could not be read. */
export async function readTeamDeletionBlockers(
  svc: ServiceRoleClient,
  teamId: string,
): Promise<TeamDeletionBlockers | null> {
  const { data, error } = await svc.rpc("team_deletion_blockers", {
    p_team: teamId,
  });
  if (error || !data) {
    logger.error(`team_deletion_blockers: ${error?.message ?? "no data"}`);
    return null;
  }
  return data as unknown as TeamDeletionBlockers;
}

/** The sentence for what stops the deletion now, or null. */
async function blockedMessage(
  svc: ServiceRoleClient,
  teamId: string,
): Promise<string | null | "error"> {
  const b = await readTeamDeletionBlockers(svc, teamId);
  if (!b) return "error";
  const key = teamDeletionBlockerKey(b);
  return key ? tr(key) : null;
}

/** An active Owner of the active team, in good standing, signed in lately. */
async function requireDeletingOwner(
  svc: ServiceRoleClient,
  userId: string,
  teamId: string,
  sessionSignedInAt: number | null,
): Promise<Fail | null> {
  if (isTeamsKillSwitchOn()) {
    return { status: 403, message: tr("teamsUnavailable") };
  }
  if (await isAccountRestricted(userId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }
  const me = await activeMembership(svc, teamId, userId);
  if (!me) return { status: 404, message: tr("teamNotFound") };
  if (me.role !== "owner") {
    return { status: 403, message: tr("teamNotAllowed") };
  }
  if (!isFreshSignIn(sessionSignedInAt)) {
    return { status: 403, message: tr("teamDeleteSignInAgain") };
  }
  return null;
}

type DeletedRow = {
  outcome: "deleted" | "blocked";
  team_id: string;
  name?: string | null;
  username?: string | null;
  member_ids?: string[];
};

/**
 * After the database deleted the team: its auth user is soft-deleted (its
 * sessions and placeholder email go; the row stays so nothing cascades
 * through the financial record), and everyone who was in it is told.
 * Best-effort: the deletion itself is already done.
 */
export async function afterTeamDeleted(
  svc: ServiceRoleClient,
  row: DeletedRow,
  options: { byStaff: boolean },
): Promise<void> {
  const { error } = await svc.auth.admin.deleteUser(row.team_id, true);
  if (error) {
    logger.error(
      `afterTeamDeleted: auth user of team ${row.team_id} not soft-deleted (${error.message})`,
    );
  }
  await noticeTeamDeleted(
    row.member_ids ?? [],
    row.name?.trim() || row.username || "",
    options.byStaff,
  ).catch((e) => logger.error(`afterTeamDeleted notices: ${e}`));
}

async function finish(
  svc: ServiceRoleClient,
  userId: string,
  teamId: string,
  requestId: string,
  counts: { owners: number; approvals: number },
): Promise<Ok<TeamDeletionOutcome> | Fail> {
  const { data, error } = await svc.rpc("team_delete_finish", {
    p_request: requestId,
    p_by: userId,
  });
  if (error) return failFromDb(error, "finishTeamDeletion");
  const row = data as unknown as DeletedRow;
  if (row.outcome === "blocked") {
    const words = await blockedMessage(svc, teamId);
    return {
      status: 409,
      message: words && words !== "error" ? words : tr("teamDeleteBlocked"),
    };
  }
  await afterTeamDeleted(svc, row, { byStaff: false });
  return {
    status: 200,
    message: tr("teamDeleted"),
    data: { state: "deleted", ...counts },
  };
}

/**
 * An Owner asks to delete the team. With one Owner it is deleted now;
 * otherwise the other Owners are told and asked to approve.
 */
export async function requestTeamDeletionCore(
  svc: ServiceRoleClient,
  userId: string,
  input: { teamId: string; confirmName: string },
  session: { signedInAt: number | null },
): Promise<Ok<TeamDeletionOutcome> | Fail> {
  const refused = await requireDeletingOwner(
    svc,
    userId,
    input.teamId,
    session.signedInAt,
  );
  if (refused) return refused;

  const { data: team } = await svc
    .from("user_info")
    .select("full_name, username")
    .eq("id", input.teamId)
    .maybeSingle();
  const name = team?.full_name?.trim() || team?.username || "";
  if (!teamNameConfirmed(input.confirmName, name)) {
    return { status: 400, message: tr("teamDeleteNameMismatch") };
  }

  const blocked = await blockedMessage(svc, input.teamId);
  if (blocked === "error") {
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (blocked) return { status: 409, message: blocked };

  const { data, error } = await svc.rpc("team_delete_request", {
    p_team: input.teamId,
    p_by: userId,
    p_days: TEAM_DELETE_REQUEST_DAYS,
  });
  if (error) return failFromDb(error, "requestTeamDeletionCore");
  const req = data as unknown as {
    request_id: string;
    owners: number;
    approvals: number;
    ready: boolean;
    owner_ids: string[];
  };
  const counts = {
    owners: Number(req.owners),
    approvals: Number(req.approvals),
  };
  if (req.ready) {
    return finish(svc, userId, input.teamId, req.request_id, counts);
  }
  await noticeTeamDeleteRequested(input.teamId, req.owner_ids, userId).catch(
    (e) => logger.error(`requestTeamDeletionCore notices: ${e}`),
  );
  return {
    status: 200,
    message: tr("teamDeleteRequested"),
    data: { state: "requested", ...counts },
  };
}

/**
 * Another Owner approves. When they are the last to, the team is deleted
 * now (if nothing stops it at that moment).
 */
export async function approveTeamDeletionCore(
  svc: ServiceRoleClient,
  userId: string,
  input: { teamId: string; requestId: string },
  session: { signedInAt: number | null },
): Promise<Ok<TeamDeletionOutcome> | Fail> {
  const refused = await requireDeletingOwner(
    svc,
    userId,
    input.teamId,
    session.signedInAt,
  );
  if (refused) return refused;
  const { data: request } = await svc
    .from("team_deletion_request")
    .select("team_id")
    .eq("id", input.requestId)
    .maybeSingle();
  if (request?.team_id !== input.teamId) {
    return { status: 404, message: tr("teamDeleteRequestEnded") };
  }

  const { data, error } = await svc.rpc("team_delete_approve", {
    p_request: input.requestId,
    p_by: userId,
  });
  if (error) return failFromDb(error, "approveTeamDeletionCore");
  const res = data as unknown as {
    outcome: "approved" | "ready" | "blocked";
    owners?: number;
    approvals?: number;
  };
  if (res.outcome === "blocked") {
    const words = await blockedMessage(svc, input.teamId);
    return {
      status: 409,
      message: words && words !== "error" ? words : tr("teamDeleteBlocked"),
    };
  }
  const counts = {
    owners: Number(res.owners ?? 0),
    approvals: Number(res.approvals ?? 0),
  };
  if (res.outcome === "ready") {
    return finish(svc, userId, input.teamId, input.requestId, counts);
  }
  return {
    status: 200,
    message: tr("teamDeleteApproved"),
    data: { state: "approved", ...counts },
  };
}

/** Any Owner stops a request; the other Owners are told. */
export async function cancelTeamDeletionCore(
  svc: ServiceRoleClient,
  userId: string,
  input: { teamId: string; requestId: string },
): Promise<Ok<TeamDeletionOutcome> | Fail> {
  // Stopping a deletion is always allowed, even with teams switched off.
  const { data: request } = await svc
    .from("team_deletion_request")
    .select("team_id")
    .eq("id", input.requestId)
    .maybeSingle();
  if (request?.team_id !== input.teamId) {
    return { status: 404, message: tr("teamDeleteRequestEnded") };
  }
  const { data, error } = await svc.rpc("team_delete_cancel", {
    p_request: input.requestId,
    p_by: userId,
  });
  if (error) return failFromDb(error, "cancelTeamDeletionCore");
  const res = data as unknown as { owner_ids?: string[] };
  await noticeTeamDeleteCancelled(
    input.teamId,
    res.owner_ids ?? [],
    userId,
  ).catch((e) => logger.error(`cancelTeamDeletionCore notices: ${e}`));
  return {
    status: 200,
    message: tr("teamDeleteCancelled"),
    data: { state: "cancelled", owners: 0, approvals: 0 },
  };
}
