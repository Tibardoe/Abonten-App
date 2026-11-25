import { randomUUID } from "node:crypto";
import { logger } from "@abonten/core/logger";
import { parsePhone } from "@abonten/core/phone";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  InviteTarget,
  MoveEventToTeamOptions,
  MoveEventToTeamResult,
  TeamActivityEntry,
  TeamConversion,
  TeamDeletionRequest,
  TeamDetail,
  TeamInviteReceived,
  TeamInviteSent,
  TeamMember,
  TeamPerson,
  TeamProfile,
  TeamRoleCode,
  TeamStatus,
  TeamSummary,
  TeamTerms,
  TeamsOverview,
} from "@abonten/types/teamType";
import type { TicketTransferRecipient } from "@abonten/types/ticketTransferType";
import { requestLocale, tr } from "../i18n/requestLocale";
import { requireVerifiedIdentity } from "../identity/identityCore";
import {
  isAccountRestricted,
  restrictedAccountMessage,
} from "../security/accountStatus";
import { maskPhone } from "../ticketTransfers/ticketTransferCore";
import {
  noticeTeamInviteAccepted,
  noticeTeamInviteReceived,
  noticeTeamMemberRemoved,
  noticeTeamOwnerDemoted,
  noticeTeamOwnerRemoved,
  noticeTeamRoleChanged,
  textTeamInvite,
} from "./teamNotices";
import {
  isTeamsKillSwitchOn,
  readTeamSettings,
  resolveTeamAccess,
  teamTermsOf,
} from "./teamProgram";

// Team accounts, stage 1 (docs/architecture/team-accounts.md).
//
// Every function takes the service-role client and a user id the transport
// already proved. The tables and every team_* function are service-role
// only. The database functions hold the rules (who may invite, the last
// Owner, one open invitation per person, the member limit, who may accept)
// under row locks; this layer adds the programme switch, the account checks
// that need the auth admin API, creating the team's sign-in-less account,
// the notices and the text to a number with no account.

type Fail = {
  status: 400 | 401 | 403 | 404 | 409 | 429 | 500;
  message: string;
};
export type TeamFail = Fail;
type Ok<T> = { status: 200; message?: string; data: T };

const PERSON_SELECT =
  "id, full_name, username, avatar_public_id, avatar_version";

type PersonRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_public_id: string | null;
  avatar_version: string | null;
};

function toPerson(row: PersonRow): TeamPerson {
  return {
    id: row.id,
    name: row.full_name,
    username: row.username,
    avatarPublicId: row.avatar_public_id,
    avatarVersion: row.avatar_version,
  };
}

// --- Errors ------------------------------------------------------------------

const SQL_ERRORS: Record<string, { status: Fail["status"]; key: string }> = {
  not_found: { status: 404, key: "teamNotFound" },
  not_member: { status: 404, key: "teamNotMember" },
  team_frozen: { status: 409, key: "teamFrozen" },
  not_allowed: { status: 403, key: "teamNotAllowed" },
  creator_unavailable: { status: 403, key: "teamCreatorUnavailable" },
  too_many_teams: { status: 409, key: "teamTooManyTeams" },
  username_taken: { status: 409, key: "teamUsernameTaken" },
  no_receiver: { status: 400, key: "teamNoReceiver" },
  bad_role: { status: 400, key: "teamBadRole" },
  self: { status: 400, key: "teamInviteSelf" },
  receiver_unavailable: { status: 409, key: "teamReceiverUnavailable" },
  already_member: { status: 409, key: "teamAlreadyMember" },
  team_full: { status: 409, key: "teamFull" },
  already_invited: { status: 409, key: "teamAlreadyInvited" },
  invite_not_found: { status: 404, key: "teamInviteNotFound" },
  invite_not_pending: { status: 409, key: "teamInviteNotPending" },
  invite_expired: { status: 409, key: "teamInviteExpired" },
  not_receiver: { status: 404, key: "teamInviteNotForYou" },
  last_owner: { status: 409, key: "teamLastOwner" },
  remove_self: { status: 400, key: "teamRemoveSelf" },
  nothing_to_move: { status: 409, key: "teamNothingToMove" },
  payout_in_progress: { status: 409, key: "teamPayoutInProgress" },
  verification_open: { status: 409, key: "teamVerificationOpen" },
  under_age: { status: 409, key: "teamUnderAge" },
  role_not_limited: { status: 409, key: "teamRoleNotLimited" },
  place_not_team: { status: 400, key: "teamPlaceNotTeam" },
  not_yours: { status: 404, key: "eventNotFound" },
  whole_run: { status: 409, key: "teamMoveWholeRun" },
  has_sales: { status: 409, key: "teamMoveHasSales" },
  seating_shared: { status: 409, key: "teamMoveSeatingShared" },
  // The team's profile (2026-11-25)
  username_invalid: { status: 400, key: "teamUsernameInvalid" },
  bad_input: { status: 400, key: "invalidInput" },
  bad_photo: { status: 403, key: "notAuthorizedForThisImage" },
  nothing_to_change: { status: 400, key: "nothingToUpdate" },
  // Deleting the team (2026-11-25)
  delete_blocked: { status: 409, key: "teamDeleteBlocked" },
  delete_pending: { status: 409, key: "teamDeletePending" },
  delete_not_found: { status: 404, key: "teamDeleteRequestEnded" },
  delete_not_pending: { status: 409, key: "teamDeleteRequestEnded" },
  delete_expired: { status: 409, key: "teamDeleteExpired" },
  delete_owners_changed: { status: 409, key: "teamDeleteOwnersChanged" },
  delete_not_ready: { status: 409, key: "teamDeleteNotReady" },
};

/** K7: they said they are 18 or older; the database keeps when. */
async function recordAdult(
  svc: ServiceRoleClient,
  teamId: string,
  userId: string,
): Promise<void> {
  const { error } = await svc
    .from("team_member")
    .update({ adult_confirmed_at: new Date().toISOString() } as never)
    .eq("team_id", teamId)
    .eq("user_id", userId);
  if (error) logger.error(`teams recordAdult: ${error.message}`);
}

const adultRequired = (): Fail => ({
  status: 400,
  message: tr("teamAdultRequired"),
});

/**
 * N4: once Abonten publishes team terms, making a team (or making an
 * account a team) means accepting that version for it. A missing version
 * is refused, a stale one (the terms changed while the form was open) too.
 */
function termsProblem(
  terms: TeamTerms | null | undefined,
  accepted: string | null | undefined,
): Fail | null {
  if (!terms) return null;
  if (!accepted) return { status: 400, message: tr("teamTermsRequired") };
  if (accepted !== terms.version) {
    return { status: 409, message: tr("teamTermsChanged") };
  }
  return null;
}

/** Keeps who accepted which team terms for which team, and in which language. */
async function recordTerms(
  svc: ServiceRoleClient,
  teamId: string,
  userId: string,
  version: string,
): Promise<boolean> {
  const { error } = await svc.from("team_terms_acceptance").upsert(
    {
      team_id: teamId,
      user_id: userId,
      terms_version: version,
      locale: requestLocale(),
    },
    { onConflict: "team_id,user_id,terms_version", ignoreDuplicates: true },
  );
  if (error) logger.error(`teams recordTerms: ${error.message}`);
  return !error;
}

/** Turns a `team:<code>` database error into an envelope. */
export function failFromDb(
  error: { message?: string } | null,
  where: string,
): Fail {
  const code = /team:([a-z_]+)/.exec(error?.message ?? "")?.[1];
  const known = code ? SQL_ERRORS[code] : undefined;
  if (known) return { status: known.status, message: tr(known.key) };
  logger.error(`${where}: ${error?.message ?? "no error text"}`);
  return { status: 500, message: tr("somethingWentWrong") };
}

const unavailable = (): Fail => ({
  status: 403,
  message: tr("teamsUnavailable"),
});

// --- Reads -------------------------------------------------------------------

async function people(
  svc: ServiceRoleClient,
  ids: (string | null | undefined)[],
): Promise<Map<string, TeamPerson>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const { data, error } = await svc
    .from("user_info")
    .select(PERSON_SELECT)
    .in("id", unique);
  if (error) logger.error(`teams people: ${error.message}`);
  return new Map(
    ((data ?? []) as PersonRow[]).map((row) => [row.id, toPerson(row)]),
  );
}

async function verifiedPhone(
  svc: ServiceRoleClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await svc.rpc("_ticket_transfer_verified_phone", {
    p_user_id: userId,
  });
  if (error) logger.error(`teams verifiedPhone: ${error.message}`);
  return (data as string | null) ?? null;
}

type MembershipRow = {
  team_id: string;
  user_id: string;
  role: string;
  joined_at: string;
};

export async function activeMembership(
  svc: ServiceRoleClient,
  teamId: string,
  userId: string,
): Promise<MembershipRow | null> {
  const { data, error } = await svc
    .from("team_member")
    .select("team_id, user_id, role, joined_at")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) logger.error(`teams activeMembership: ${error.message}`);
  return (data as MembershipRow | null) ?? null;
}

async function summaries(
  svc: ServiceRoleClient,
  memberships: MembershipRow[],
): Promise<TeamSummary[] | null> {
  if (memberships.length === 0) return [];
  const ids = memberships.map((m) => m.team_id);
  const [teams, profiles, counts] = await Promise.all([
    svc.from("team").select("account_id, status").in("account_id", ids),
    svc
      .from("user_info")
      .select(`${PERSON_SELECT}, organizer_verified`)
      .in("id", ids),
    svc
      .from("team_member")
      .select("team_id")
      .in("team_id", ids)
      .eq("status", "active"),
  ]);
  if (teams.error || profiles.error || counts.error) {
    logger.error(
      `teams summaries: ${teams.error?.message ?? profiles.error?.message ?? counts.error?.message}`,
    );
    return null;
  }
  const status = new Map(
    (teams.data ?? []).map((t) => [t.account_id, t.status as TeamStatus]),
  );
  const profile = new Map(
    (
      (profiles.data ?? []) as (PersonRow & {
        organizer_verified: boolean | null;
      })[]
    ).map((p) => [p.id, p]),
  );
  const count = new Map<string, number>();
  for (const row of counts.data ?? []) {
    count.set(row.team_id, (count.get(row.team_id) ?? 0) + 1);
  }
  const out: TeamSummary[] = [];
  for (const m of memberships) {
    const p = profile.get(m.team_id);
    if (!p) continue;
    out.push({
      id: m.team_id,
      name: p.full_name,
      username: p.username,
      avatarPublicId: p.avatar_public_id,
      avatarVersion: p.avatar_version,
      status: status.get(m.team_id) ?? "active",
      role: m.role as TeamRoleCode,
      memberCount: count.get(m.team_id) ?? 0,
      verified: p.organizer_verified === true,
    });
  }
  return out;
}

/** The teams the person runs and the invitations waiting for them. */
export async function getTeamsOverviewCore(
  svc: ServiceRoleClient,
  userId: string,
): Promise<Ok<TeamsOverview> | Fail> {
  const { program } = await resolveTeamAccess(svc, userId);
  const { data: rows, error } = await svc
    .from("team_member")
    .select("team_id, user_id, role, joined_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(100);
  if (error) return failFromDb(error, "getTeamsOverviewCore");
  const teams = await summaries(svc, (rows ?? []) as MembershipRow[]);
  if (!teams) return { status: 500, message: tr("somethingWentWrong") };
  const invites = await listInvitesForPerson(svc, userId);
  if (!invites) return { status: 500, message: tr("somethingWentWrong") };
  const canConvert = program.enabled ? await runsListings(svc, userId) : false;
  return { status: 200, data: { program, teams, invites, canConvert } };
}

/** Whether the person runs events or places of their own. */
async function runsListings(
  svc: ServiceRoleClient,
  userId: string,
): Promise<boolean> {
  const [events, places] = await Promise.all([
    svc
      .from("event")
      .select("id", { count: "exact", head: true })
      .eq("organizer_id", userId),
    svc
      .from("place")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId),
  ]);
  return (events.count ?? 0) + (places.count ?? 0) > 0;
}

type InviteRow = {
  id: string;
  team_id: string;
  role: string;
  to_user_id: string | null;
  to_phone: string | null;
  invited_by: string | null;
  status: string;
  text_sent_at: string | null;
  created_at: string;
  expires_at: string;
};

const INVITE_SELECT =
  "id, team_id, role, to_user_id, to_phone, invited_by, status, text_sent_at, created_at, expires_at";

async function listInvitesForPerson(
  svc: ServiceRoleClient,
  userId: string,
): Promise<TeamInviteReceived[] | null> {
  const now = new Date().toISOString();
  const phone = await verifiedPhone(svc, userId);
  const [named, byPhone] = await Promise.all([
    svc
      .from("team_invite")
      .select(INVITE_SELECT)
      .eq("to_user_id", userId)
      .eq("status", "pending")
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(50),
    phone
      ? svc
          .from("team_invite")
          .select(INVITE_SELECT)
          .is("to_user_id", null)
          .eq("to_phone", phone)
          .eq("status", "pending")
          .gt("expires_at", now)
          .order("created_at", { ascending: false })
          .limit(50)
      : null,
  ]);
  if (named.error || byPhone?.error) {
    logger.error(
      `teams listInvitesForPerson: ${named.error?.message ?? byPhone?.error?.message}`,
    );
    return null;
  }
  const rows = [
    ...((named.data ?? []) as InviteRow[]),
    ...((byPhone?.data ?? []) as InviteRow[]),
  ];
  if (rows.length === 0) return [];
  const persons = await people(svc, [
    ...rows.map((r) => r.team_id),
    ...rows.map((r) => r.invited_by),
  ]);
  const out: TeamInviteReceived[] = [];
  for (const r of rows) {
    const team = persons.get(r.team_id);
    if (!team) continue;
    out.push({
      id: r.id,
      role: r.role as TeamRoleCode,
      team,
      invitedBy: r.invited_by ? (persons.get(r.invited_by) ?? null) : null,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    });
  }
  return out;
}

/** One team as a member sees it; Owners also see invitations and activity. */
export async function getTeamCore(
  svc: ServiceRoleClient,
  userId: string,
  teamId: string,
): Promise<Ok<TeamDetail> | Fail> {
  const me = await activeMembership(svc, teamId, userId);
  if (!me) return { status: 404, message: tr("teamNotFound") };
  const isOwner = me.role === "owner";

  const [summary, members, invites, activity, settings] = await Promise.all([
    summaries(svc, [me]),
    svc
      .from("team_member")
      .select("user_id, role, joined_at")
      .eq("team_id", teamId)
      .eq("status", "active")
      .order("joined_at", { ascending: true })
      .limit(500),
    isOwner
      ? svc
          .from("team_invite")
          .select(INVITE_SELECT)
          .eq("team_id", teamId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(100)
      : null,
    isOwner
      ? svc
          .from("team_activity")
          .select(
            "id, actor_user_id, action, subject_kind, subject_id, details, created_at",
          )
          .eq("team_id", teamId)
          .order("created_at", { ascending: false })
          .limit(50)
      : null,
    readTeamSettings(svc),
  ]);
  if (!summary?.[0]) return { status: 500, message: tr("somethingWentWrong") };
  if (members.error) return failFromDb(members.error, "getTeamCore");
  if (invites?.error) return failFromDb(invites.error, "getTeamCore");
  if (activity?.error) return failFromDb(activity.error, "getTeamCore");

  const memberRows = (members.data ?? []) as {
    user_id: string;
    role: string;
    joined_at: string;
  }[];
  const inviteRows = (invites?.data ?? []) as InviteRow[];
  type ActivityRow = {
    id: number;
    actor_user_id: string | null;
    action: string;
    subject_kind: string | null;
    subject_id: string | null;
    details: Record<string, unknown> | null;
    created_at: string;
  };
  const activityRows = (activity?.data ?? []) as ActivityRow[];
  // A member, or a person the team dealt with (a promoter it added).
  const personSubject = (kind: string | null) =>
    kind === "member" || kind === "person";
  const memberSubjects = activityRows
    .filter((a) => personSubject(a.subject_kind) && a.subject_id)
    .map((a) => a.subject_id as string);

  const [persons, idChecks] = await Promise.all([
    people(svc, [
      ...memberRows.map((m) => m.user_id),
      ...inviteRows.map((i) => i.to_user_id),
      ...inviteRows.map((i) => i.invited_by),
      ...activityRows.map((a) => a.actor_user_id),
      ...memberSubjects,
    ]),
    // A live check (public.account_id_checked), not a lapsed one.
    svc
      .from("user_info")
      .select("id, id_checked")
      .in(
        "id",
        memberRows.map((m) => m.user_id),
      ),
  ]);
  const checked = new Map(
    (idChecks.data ?? []).map((r) => [r.id, r.id_checked === true]),
  );

  // Owners limit Front desk and Door staff to some of the team's places.
  const [limits, teamPlaces] = isOwner
    ? await Promise.all([
        svc
          .from("team_member_place")
          .select("user_id, place_id")
          .eq("team_id", teamId),
        svc
          .from("place")
          .select("id, name")
          .eq("owner_id", teamId)
          .order("name")
          .limit(200),
      ])
    : [null, null];
  const limitsOf = new Map<string, string[]>();
  for (const l of (limits?.data ?? []) as {
    user_id: string;
    place_id: string;
  }[]) {
    limitsOf.set(l.user_id, [...(limitsOf.get(l.user_id) ?? []), l.place_id]);
  }

  // The profile an Owner edits, and a request to delete the team.
  const [profileRow, deletion] = isOwner
    ? await Promise.all([
        svc
          .from("user_info")
          .select("bio, website, social_links")
          .eq("id", teamId)
          .maybeSingle(),
        pendingDeletion(svc, teamId, userId),
      ])
    : [null, null];

  // N4: the published team terms, and which Owners accepted them.
  const published = teamTermsOf(settings);
  let terms: TeamDetail["terms"] = null;
  if (published) {
    const { data: accepted } = await svc
      .from("team_terms_acceptance")
      .select("user_id")
      .eq("team_id", teamId)
      .eq("terms_version", published.version);
    const owners = new Set(
      memberRows.filter((m) => m.role === "owner").map((m) => m.user_id),
    );
    const acceptedBy = (accepted ?? []).map((a) => a.user_id);
    terms = {
      ...published,
      acceptedByMe: acceptedBy.includes(userId),
      acceptedByAnOwner: acceptedBy.some((id) => owners.has(id)),
    };
  }

  const memberList: TeamMember[] = [];
  for (const m of memberRows) {
    const person = persons.get(m.user_id);
    if (!person) continue;
    memberList.push({
      person,
      role: m.role as TeamRoleCode,
      joinedAt: m.joined_at,
      idChecked: checked.get(m.user_id) ?? false,
      ...(isOwner ? { placeIds: limitsOf.get(m.user_id) ?? null } : {}),
    });
  }

  const inviteList: TeamInviteSent[] | null = isOwner
    ? inviteRows.map((r) => ({
        id: r.id,
        role: r.role as TeamRoleCode,
        to: r.to_user_id ? (persons.get(r.to_user_id) ?? null) : null,
        toPhoneMasked: r.to_phone ? maskPhone(r.to_phone) : null,
        toPhoneTexted:
          r.to_user_id || !r.to_phone ? null : r.text_sent_at !== null,
        invitedBy: r.invited_by ? (persons.get(r.invited_by) ?? null) : null,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      }))
    : null;

  const activityList: TeamActivityEntry[] | null = isOwner
    ? activityRows.map((a) => ({
        id: a.id,
        actor: a.actor_user_id ? (persons.get(a.actor_user_id) ?? null) : null,
        action: a.action,
        subjectKind: a.subject_kind,
        subjectId: a.subject_id,
        subject:
          personSubject(a.subject_kind) && a.subject_id
            ? (persons.get(a.subject_id) ?? null)
            : null,
        // Never a full number: invitations keep only the last four digits.
        details: a.details ?? {},
        createdAt: a.created_at,
      }))
    : null;

  return {
    status: 200,
    data: {
      team: summary[0],
      members: memberList,
      invites: inviteList,
      activity: activityList,
      terms,
      places: isOwner
        ? ((teamPlaces?.data ?? []) as { id: string; name: string }[])
        : null,
      profile: profileRow?.data
        ? {
            bio: profileRow.data.bio ?? null,
            website: profileRow.data.website ?? null,
            socialLinks:
              (profileRow.data.social_links as TeamProfile["socialLinks"]) ??
              null,
          }
        : null,
      deletion,
    },
  };
}

/**
 * The open request to delete the team, as its Owners see it: who asked,
 * how many Owners have approved, who is still to. A request past its
 * deadline reads as none (the sweep ends it).
 */
async function pendingDeletion(
  svc: ServiceRoleClient,
  teamId: string,
  userId: string,
): Promise<TeamDeletionRequest | null> {
  const { data: request, error } = await svc
    .from("team_deletion_request")
    .select("id, requested_by, owner_ids, created_at, expires_at")
    .eq("team_id", teamId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) logger.error(`teams pendingDeletion: ${error.message}`);
  if (!request) return null;
  const { data: approvals } = await svc
    .from("team_deletion_approval")
    .select("owner_id")
    .eq("request_id", request.id);
  const owners = (request.owner_ids ?? []) as string[];
  const approved = new Set(
    (approvals ?? [])
      .map((a) => a.owner_id as string)
      .filter((id) => owners.includes(id)),
  );
  const persons = await people(svc, [request.requested_by, ...owners]);
  return {
    id: request.id,
    requestedBy: request.requested_by
      ? (persons.get(request.requested_by) ?? null)
      : null,
    createdAt: request.created_at,
    expiresAt: request.expires_at,
    owners: owners.length,
    approvals: approved.size,
    approvedByMe: approved.has(userId),
    waitingFor: owners
      .filter((id) => !approved.has(id))
      .map((id) => persons.get(id))
      .filter((p): p is TeamPerson => !!p),
  };
}

/**
 * An Owner accepts the published team terms for the team (N4). The team's
 * money waits until one Owner has accepted the current version
 * (team_terms_accepted); every Owner is asked until they have.
 */
export async function acceptTeamTermsCore(
  svc: ServiceRoleClient,
  userId: string,
  input: { teamId: string; termsVersion: string },
): Promise<Ok<{ version: string }> | Fail> {
  const me = await activeMembership(svc, input.teamId, userId);
  if (!me) return { status: 404, message: tr("teamNotFound") };
  if (me.role !== "owner") {
    return { status: 403, message: tr("teamNotAllowed") };
  }
  const published = teamTermsOf(await readTeamSettings(svc, { fresh: true }));
  if (!published) return { status: 409, message: tr("teamTermsNone") };
  if (input.termsVersion !== published.version) {
    return { status: 409, message: tr("teamTermsChanged") };
  }
  if (!(await recordTerms(svc, input.teamId, userId, published.version))) {
    return { status: 500, message: tr("somethingWentWrong") };
  }
  const { error } = await svc.from("team_activity").insert({
    team_id: input.teamId,
    actor_user_id: userId,
    action: "terms_accepted",
    details: { version: published.version },
  });
  if (error) logger.error(`acceptTeamTermsCore activity: ${error.message}`);
  return { status: 200, data: { version: published.version } };
}

// --- Making a team -----------------------------------------------------------

/**
 * Makes a team run by the person as its first Owner. The team is its own
 * account: an auth user that can never sign in (no password, no identity,
 * banned) whose profile row becomes the team's.
 */
export async function createTeamCore(
  svc: ServiceRoleClient,
  userId: string,
  input: {
    name: string;
    username: string;
    adult: boolean;
    termsVersion?: string | null;
  },
): Promise<Ok<TeamSummary> | Fail> {
  if (input.adult !== true) return adultRequired();
  const access = await resolveTeamAccess(svc, userId);
  if (!access.program.enabled) return unavailable();
  const termsFail = termsProblem(access.program.terms, input.termsVersion);
  if (termsFail) return termsFail;
  if (await isAccountRestricted(userId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }
  const { data: taken } = await svc
    .from("user_info")
    .select("id")
    .ilike("username", input.username)
    .maybeSingle();
  if (taken) return { status: 409, message: tr("teamUsernameTaken") };

  const { data: created, error: createError } = await svc.auth.admin.createUser(
    {
      email: `team-${randomUUID()}@teams.abontenhub.invalid`,
      email_confirm: true,
      // A team is never signed in to; its members act for it.
      ban_duration: "876000h",
      user_metadata: { full_name: input.name },
      app_metadata: { account_kind: "team" },
    },
  );
  if (createError || !created.user) {
    logger.error(
      `createTeamCore: auth user not created (${createError?.message})`,
    );
    return { status: 500, message: tr("somethingWentWrong") };
  }
  const accountId = created.user.id;

  const { error } = await svc.rpc("team_finalize_create", {
    p_account: accountId,
    p_creator: userId,
    p_name: input.name,
    p_username: input.username,
    p_max_created: access.maxTeamsCreated,
  });
  if (error) {
    const { error: cleanupError } = await svc.auth.admin.deleteUser(accountId);
    if (cleanupError) {
      logger.error(
        `createTeamCore: team account ${accountId} left behind (${cleanupError.message})`,
      );
    }
    return failFromDb(error, "createTeamCore");
  }
  await recordAdult(svc, accountId, userId);
  if (access.program.terms) {
    await recordTerms(svc, accountId, userId, access.program.terms.version);
  }
  const summary = await summaries(svc, [
    {
      team_id: accountId,
      user_id: userId,
      role: "owner",
      joined_at: new Date().toISOString(),
    },
  ]);
  if (!summary?.[0]) return { status: 500, message: tr("somethingWentWrong") };
  return { status: 200, data: summary[0] };
}

/**
 * "Make this a team" (X8; docs/architecture/team-accounts.md §4f): the
 * person's organizer and place work becomes a team that takes their handle,
 * photo, events, places, followers, conversations about them, organizer
 * money and badge; the person is its first Owner and gets a new handle.
 * Their tickets, credit, posts, direct messages and ID check stay theirs.
 */
export async function convertAccountToTeamCore(
  svc: ServiceRoleClient,
  userId: string,
  input: { name: string; adult: boolean; termsVersion?: string | null },
): Promise<Ok<TeamConversion> | Fail> {
  if (input.adult !== true) return adultRequired();
  const access = await resolveTeamAccess(svc, userId);
  if (!access.program.enabled) return unavailable();
  const termsFail = termsProblem(access.program.terms, input.termsVersion);
  if (termsFail) return termsFail;
  if (await isAccountRestricted(userId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }

  const { data: created, error: createError } = await svc.auth.admin.createUser(
    {
      email: `team-${randomUUID()}@teams.abontenhub.invalid`,
      email_confirm: true,
      // A team is never signed in to; its members act for it.
      ban_duration: "876000h",
      user_metadata: { full_name: input.name },
      app_metadata: { account_kind: "team" },
    },
  );
  if (createError || !created.user) {
    logger.error(
      `convertAccountToTeamCore: auth user not created (${createError?.message})`,
    );
    return { status: 500, message: tr("somethingWentWrong") };
  }
  const accountId = created.user.id;

  const { data: moved, error } = await svc.rpc("team_convert_account", {
    p_account: accountId,
    p_person: userId,
    p_name: input.name,
    p_max_created: access.maxTeamsCreated,
  });
  if (error) {
    const { error: cleanupError } = await svc.auth.admin.deleteUser(accountId);
    if (cleanupError) {
      logger.error(
        `convertAccountToTeamCore: team account ${accountId} left behind (${cleanupError.message})`,
      );
    }
    return failFromDb(error, "convertAccountToTeamCore");
  }
  const counts = (moved ?? {}) as {
    events?: number;
    places?: number;
    followers?: number;
    person_username?: string;
    badge_back_in_review?: boolean;
  };
  await recordAdult(svc, accountId, userId);
  if (access.program.terms) {
    await recordTerms(svc, accountId, userId, access.program.terms.version);
  }
  const summary = await summaries(svc, [
    {
      team_id: accountId,
      user_id: userId,
      role: "owner",
      joined_at: new Date().toISOString(),
    },
  ]);
  if (!summary?.[0]) return { status: 500, message: tr("somethingWentWrong") };
  return {
    status: 200,
    data: {
      team: summary[0],
      events: Number(counts.events ?? 0),
      places: Number(counts.places ?? 0),
      followers: Number(counts.followers ?? 0),
      personUsername: counts.person_username ?? "",
      badgeBackInReview: counts.badge_back_in_review === true,
    },
  };
}

// --- Move events into a team -------------------------------------------------
//
// An organizer who made a team after listing events moves them into it
// (docs/architecture/team-accounts.md, "Move events into a team"): only
// their own, a whole run of shows at once, and only while nobody has bought
// or registered (money already earned stays with the account that earned
// it). public.team_move_events holds the rules under row locks; this layer
// adds the kill switch, the account check and the ID check a team's paid
// events need, and works out the run.

type MovableEvent = {
  id: string;
  organizer_id: string;
  series_id: string | null;
};

/** The event and, when it is in a run, every show of the run. */
async function eventsToMove(
  svc: ServiceRoleClient,
  userId: string,
  eventId: string,
): Promise<{ ids: string[] } | { fail: Fail }> {
  const { data, error } = await svc
    .from("event")
    .select("id, organizer_id, series_id")
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    logger.error(`teams eventsToMove: ${error.message}`);
    return { fail: { status: 500, message: tr("somethingWentWrong") } };
  }
  const event = data as MovableEvent | null;
  if (!event || event.organizer_id !== userId) {
    return { fail: { status: 404, message: tr("eventNotFound") } };
  }
  if (!event.series_id) return { ids: [event.id] };
  const { data: shows, error: showsError } = await svc
    .from("event")
    .select("id")
    .eq("series_id", event.series_id);
  if (showsError) {
    logger.error(`teams eventsToMove shows: ${showsError.message}`);
    return { fail: { status: 500, message: tr("somethingWentWrong") } };
  }
  return { ids: (shows ?? []).map((s) => (s as { id: string }).id) };
}

/** Whether anyone has bought or registered for any of the events. */
async function eventsHaveSales(
  svc: ServiceRoleClient,
  ids: string[],
): Promise<boolean | null> {
  const { data: types, error: typesError } = await svc
    .from("ticket_type")
    .select("id")
    .in("event_id", ids);
  if (typesError) {
    logger.error(`teams eventsHaveSales types: ${typesError.message}`);
    return null;
  }
  const typeIds = (types ?? []).map((t) => (t as { id: string }).id);
  const [tickets, checkouts, ledger] = await Promise.all([
    typeIds.length
      ? svc
          .from("ticket")
          .select("id", { count: "exact", head: true })
          .in("ticket_type_id", typeIds)
      : Promise.resolve({ count: 0, error: null }),
    svc
      .from("ticket_checkout")
      .select("id", { count: "exact", head: true })
      .in("event_id", ids)
      .in("status", ["pending", "on_plan", "paid"]),
    svc
      .from("organizer_ledger_entry")
      .select("id", { count: "exact", head: true })
      .in("event_id", ids),
  ]);
  const failed = tickets.error ?? checkouts.error ?? ledger.error;
  if (failed) {
    logger.error(`teams eventsHaveSales: ${failed.message}`);
    return null;
  }
  return (
    (tickets.count ?? 0) + (checkouts.count ?? 0) + (ledger.count ?? 0) > 0
  );
}

/** Active teams the person is an Owner of. */
async function ownedTeams(
  svc: ServiceRoleClient,
  userId: string,
): Promise<MoveEventToTeamOptions["teams"] | null> {
  const { data: memberships, error } = await svc
    .from("team_member")
    .select("team_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("role", "owner");
  if (error) {
    logger.error(`teams ownedTeams: ${error.message}`);
    return null;
  }
  const ids = (memberships ?? []).map(
    (m) => (m as { team_id: string }).team_id,
  );
  if (ids.length === 0) return [];
  const [teams, profiles] = await Promise.all([
    svc
      .from("team")
      .select("account_id")
      .in("account_id", ids)
      .eq("status", "active"),
    svc.from("user_info").select("id, full_name, username").in("id", ids),
  ]);
  if (teams.error || profiles.error) {
    logger.error(
      `teams ownedTeams: ${teams.error?.message ?? profiles.error?.message}`,
    );
    return null;
  }
  const active = new Set(
    (teams.data ?? []).map((t) => (t as { account_id: string }).account_id),
  );
  return (
    (profiles.data ?? []) as {
      id: string;
      full_name: string | null;
      username: string | null;
    }[]
  )
    .filter((p) => active.has(p.id))
    .map((p) => ({ id: p.id, name: p.full_name, username: p.username }));
}

/**
 * What "Move to a team" can offer for one of the person's own events: the
 * teams they own, how many listings would move, and whether sales keep it
 * where it is. Teams switched off: nothing to offer.
 */
export async function getMoveEventToTeamOptionsCore(
  svc: ServiceRoleClient,
  userId: string,
  eventId: string,
): Promise<Ok<MoveEventToTeamOptions> | Fail> {
  if (isTeamsKillSwitchOn()) {
    return { status: 200, data: { teams: [], eventCount: 0, hasSales: false } };
  }
  const run = await eventsToMove(svc, userId, eventId);
  if ("fail" in run) return run.fail;
  const [teams, hasSales] = await Promise.all([
    ownedTeams(svc, userId),
    eventsHaveSales(svc, run.ids),
  ]);
  if (teams === null || hasSales === null) {
    return { status: 500, message: tr("somethingWentWrong") };
  }
  return {
    status: 200,
    data: { teams, eventCount: run.ids.length, hasSales },
  };
}

/** Moves one of the person's own events (its whole run) into their team. */
export async function moveEventToTeamCore(
  svc: ServiceRoleClient,
  userId: string,
  input: { eventId: string; teamId: string },
): Promise<Ok<MoveEventToTeamResult> | Fail> {
  if (isTeamsKillSwitchOn()) return unavailable();
  if (await isAccountRestricted(userId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }
  const membership = await activeMembership(svc, input.teamId, userId);
  if (!membership) return { status: 404, message: tr("teamNotMember") };
  if (membership.role !== "owner") {
    return { status: 403, message: tr("teamNotAllowed") };
  }
  const run = await eventsToMove(svc, userId, input.eventId);
  if ("fail" in run) return run.fail;

  // Selling tickets as the team needs its Owners' ID check, when required.
  const { data: paid, error: paidError } = await svc
    .from("ticket_type")
    .select("id")
    .in("event_id", run.ids)
    .gt("price", 0)
    .limit(1);
  if (paidError) {
    logger.error(`moveEventToTeamCore paid types: ${paidError.message}`);
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if ((paid ?? []).length > 0) {
    const gate = await requireVerifiedIdentity(
      svc,
      input.teamId,
      "paid_events",
    );
    if (gate) {
      return {
        status: gate.status === 503 ? 500 : 409,
        message: gate.message ?? tr("somethingWentWrong"),
      };
    }
  }

  const { data, error } = await svc.rpc("team_move_events", {
    p_team: input.teamId,
    p_person: userId,
    p_event_ids: run.ids,
  });
  if (error) return failFromDb(error, "moveEventToTeamCore");
  const moved = Number((data as { events?: number } | null)?.events ?? 0);

  const { data: profile } = await svc
    .from("user_info")
    .select("full_name")
    .eq("id", input.teamId)
    .maybeSingle();
  const name = (profile as { full_name: string | null } | null)?.full_name;
  return {
    status: 200,
    message: tr("teamEventsMoved", { count: moved, team: name ?? "" }),
    data: {
      team: { id: input.teamId, name: name ?? null, role: "owner" },
      events: moved,
    },
  };
}

export async function renameTeamCore(
  svc: ServiceRoleClient,
  userId: string,
  input: { teamId: string; name: string },
): Promise<Ok<{ name: string }> | Fail> {
  if (await isAccountRestricted(userId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }
  // A Verified team's badge names the business: a new name goes back to
  // review (X42; the database does it, trigger team_name_back_to_review).
  const { data: before } = await svc
    .from("user_info")
    .select("full_name, organizer_verified")
    .eq("id", input.teamId)
    .maybeSingle();
  const { error } = await svc.rpc("team_rename", {
    p_team: input.teamId,
    p_by: userId,
    p_name: input.name,
  });
  if (error) return failFromDb(error, "renameTeamCore");
  const backInReview =
    before?.organizer_verified === true && before.full_name !== input.name;
  return {
    status: 200,
    ...(backInReview ? { message: tr("teamRenamedBadgeInReview") } : {}),
    data: { name: input.name },
  };
}

// --- Invitations -------------------------------------------------------------

async function personCountry(
  svc: ServiceRoleClient,
  userId: string,
): Promise<string> {
  const { data } = await svc
    .from("user_info")
    .select("country_code")
    .eq("id", userId)
    .maybeSingle();
  return data?.country_code?.trim() || "GH";
}

async function personByUsername(
  svc: ServiceRoleClient,
  username: string,
): Promise<PersonRow | null> {
  const handle = username.trim().replace(/^@+/, "");
  if (!/^[A-Za-z0-9_]{1,40}$/.test(handle)) return null;
  const { data, error } = await svc
    .from("user_info")
    .select(PERSON_SELECT)
    .ilike("username", handle)
    .eq("status_id", 1)
    .eq("account_kind", "person")
    .maybeSingle();
  if (error) logger.error(`teams personByUsername: ${error.message}`);
  return (data as PersonRow | null) ?? null;
}

/**
 * Who an Owner is about to invite: a username shows the public name and
 * photo; a number is only checked and masked, never said to belong to
 * anyone, so the lookup cannot be used to test numbers.
 */
export async function findTeamInviteeCore(
  svc: ServiceRoleClient,
  userId: string,
  input: { teamId: string; target: InviteTarget },
): Promise<Ok<TicketTransferRecipient> | Fail> {
  const me = await activeMembership(svc, input.teamId, userId);
  if (!me) return { status: 404, message: tr("teamNotFound") };
  if (me.role !== "owner") {
    return { status: 403, message: tr("teamNotAllowed") };
  }
  if (input.target.kind === "username") {
    const row = await personByUsername(svc, input.target.username);
    if (!row) return { status: 404, message: tr("teamAccountNotFound") };
    return { status: 200, data: { kind: "account", person: toPerson(row) } };
  }
  const parsed = parsePhone(
    input.target.phone,
    await personCountry(svc, userId),
  );
  if (!parsed.ok) return { status: 400, message: tr("teamPhoneInvalid") };
  return {
    status: 200,
    data: {
      kind: "phone",
      phoneE164: parsed.e164,
      phoneMasked: maskPhone(parsed.e164),
    },
  };
}

async function textsSentToday(
  svc: ServiceRoleClient,
  teamId: string,
): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await svc
    .from("team_invite")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .gte("text_sent_at", since);
  if (error) logger.error(`teams textsSentToday: ${error.message}`);
  return count ?? 0;
}

export async function inviteTeamMemberCore(
  svc: ServiceRoleClient,
  userId: string,
  input: { teamId: string; role: TeamRoleCode; target: InviteTarget },
  deps: { canTextNumber: (e164: string) => Promise<boolean> },
): Promise<Ok<TeamInviteSent> | Fail> {
  const access = await resolveTeamAccess(svc, userId);
  if (!access.program.enabled) return unavailable();
  if (await isAccountRestricted(userId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }

  let toUserId: string | null = null;
  let toPhone: string | null = null;
  if (input.target.kind === "username") {
    const row = await personByUsername(svc, input.target.username);
    if (!row) return { status: 404, message: tr("teamAccountNotFound") };
    toUserId = row.id;
  } else {
    const parsed = parsePhone(
      input.target.phone,
      await personCountry(svc, userId),
    );
    if (!parsed.ok) return { status: 400, message: tr("teamPhoneInvalid") };
    toPhone = parsed.e164;
    const { data: owner } = await svc.rpc("ticket_transfer_user_by_phone", {
      p_phone: toPhone,
    });
    if (!owner) {
      // Nobody has this number yet: the invitation reaches them by text, so
      // it needs a number Abonten can text and a text left for today.
      if (!(await deps.canTextNumber(toPhone))) {
        return { status: 409, message: tr("teamCannotText") };
      }
      if (
        (await textsSentToday(svc, input.teamId)) >= access.textsPerTeamPerDay
      ) {
        return { status: 429, message: tr("teamTextLimit") };
      }
    }
  }

  const { data, error } = await svc.rpc("team_invite_send", {
    p_team: input.teamId,
    p_by: userId,
    p_role: input.role,
    p_to_user: toUserId,
    p_to_phone: toPhone,
    p_hours: access.inviteHours,
    p_max_members: access.maxMembers,
  });
  if (error) return failFromDb(error, "inviteTeamMemberCore");
  const sent = (data ?? [])[0];
  if (!sent) return { status: 500, message: tr("somethingWentWrong") };

  let texted: boolean | null = null;
  if (sent.resolved_to_user_id) {
    await noticeTeamInviteReceived(sent.invite_id);
  } else if (toPhone) {
    texted = await textTeamInvite(sent.invite_id);
    if (texted) {
      await svc
        .from("team_invite")
        .update({ text_sent_at: new Date().toISOString() })
        .eq("id", sent.invite_id);
    }
  }

  const persons = await people(svc, [sent.resolved_to_user_id, userId]);
  return {
    status: 200,
    data: {
      id: sent.invite_id,
      role: input.role,
      to: sent.resolved_to_user_id
        ? (persons.get(sent.resolved_to_user_id) ?? null)
        : null,
      toPhoneMasked:
        !sent.resolved_to_user_id && toPhone ? maskPhone(toPhone) : null,
      toPhoneTexted: sent.resolved_to_user_id ? null : texted,
      invitedBy: persons.get(userId) ?? null,
      createdAt: new Date().toISOString(),
      expiresAt: sent.expires_at,
    },
  };
}

export async function answerTeamInviteCore(
  svc: ServiceRoleClient,
  userId: string,
  input: {
    inviteId: string;
    action: "accept" | "decline";
    /** K7: accepting says they are 18 or older. */
    adult?: boolean;
  },
): Promise<Ok<{ teamId: string; joined: boolean }> | Fail> {
  if (input.action === "decline") {
    const { data, error } = await svc.rpc("team_invite_decline", {
      p_invite: input.inviteId,
      p_user: userId,
    });
    if (error) return failFromDb(error, "answerTeamInviteCore");
    const row = (data ?? [])[0];
    return { status: 200, data: { teamId: row?.team_id ?? "", joined: false } };
  }
  if (isTeamsKillSwitchOn()) return unavailable();
  if (input.adult !== true) return adultRequired();
  if (await isAccountRestricted(userId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }
  const access = await resolveTeamAccess(svc, userId);
  const { data, error } = await svc.rpc("team_invite_accept", {
    p_invite: input.inviteId,
    p_user: userId,
    p_max_members: access.maxMembers,
  });
  if (error) return failFromDb(error, "answerTeamInviteCore");
  const row = (data ?? [])[0];
  if (!row) return { status: 500, message: tr("somethingWentWrong") };
  await recordAdult(svc, row.team_id, userId);
  if (row.invited_by) {
    await noticeTeamInviteAccepted(
      row.team_id,
      row.invited_by,
      userId,
      row.role,
    );
  }
  return { status: 200, data: { teamId: row.team_id, joined: true } };
}

export async function cancelTeamInviteCore(
  svc: ServiceRoleClient,
  userId: string,
  inviteId: string,
): Promise<Ok<{ cancelled: true }> | Fail> {
  const { error } = await svc.rpc("team_invite_cancel", {
    p_invite: inviteId,
    p_by: userId,
  });
  if (error) return failFromDb(error, "cancelTeamInviteCore");
  return { status: 200, data: { cancelled: true } };
}

// --- Members -----------------------------------------------------------------

export async function setTeamMemberRoleCore(
  svc: ServiceRoleClient,
  userId: string,
  input: { teamId: string; userId: string; role: TeamRoleCode },
): Promise<Ok<{ role: TeamRoleCode }> | Fail> {
  if (await isAccountRestricted(userId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }
  const { data: previous, error } = await svc.rpc("team_member_set_role", {
    p_team: input.teamId,
    p_by: userId,
    p_user: input.userId,
    p_role: input.role,
  });
  if (error) return failFromDb(error, "setTeamMemberRoleCore");
  if (previous !== input.role) {
    // An Owner demoted by someone else is told who did it: it also holds
    // back a request to delete the team for 7 days (team_deletion_blockers).
    if (previous === "owner" && input.userId !== userId) {
      await noticeTeamOwnerDemoted(
        input.teamId,
        input.userId,
        userId,
        input.role,
      );
    } else {
      await noticeTeamRoleChanged(input.teamId, input.userId, input.role);
    }
  }
  return { status: 200, data: { role: input.role } };
}

/**
 * An Owner limits a Front desk or Door staff member to some of the team's
 * places (a chain), or lifts the limit (no places = all of them).
 */
export async function setTeamMemberPlacesCore(
  svc: ServiceRoleClient,
  userId: string,
  input: { teamId: string; userId: string; placeIds: string[] },
): Promise<Ok<{ placeIds: string[] | null }> | Fail> {
  if (await isAccountRestricted(userId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }
  const { error } = await svc.rpc("team_member_set_places", {
    p_team: input.teamId,
    p_by: userId,
    p_user: input.userId,
    p_places: input.placeIds,
  });
  if (error) return failFromDb(error, "setTeamMemberPlacesCore");
  return {
    status: 200,
    data: { placeIds: input.placeIds.length > 0 ? input.placeIds : null },
  };
}

/** An Owner removes a member; their access to the team ends at once. */
export async function removeTeamMemberCore(
  svc: ServiceRoleClient,
  userId: string,
  input: { teamId: string; userId: string },
): Promise<Ok<{ removed: true }> | Fail> {
  const { data: role, error } = await svc.rpc("team_member_remove", {
    p_team: input.teamId,
    p_by: userId,
    p_user: input.userId,
  });
  if (error) return failFromDb(error, "removeTeamMemberCore");
  // An Owner removed by another Owner is told who did it.
  if (role === "owner") {
    await noticeTeamOwnerRemoved(input.teamId, input.userId, userId);
  } else {
    await noticeTeamMemberRemoved(input.teamId, input.userId);
  }
  return { status: 200, data: { removed: true } };
}

/** A member leaves. The last Owner names another Owner first. */
export async function leaveTeamCore(
  svc: ServiceRoleClient,
  userId: string,
  teamId: string,
): Promise<Ok<{ left: true }> | Fail> {
  const { error } = await svc.rpc("team_member_leave", {
    p_team: teamId,
    p_user: userId,
  });
  if (error) return failFromDb(error, "leaveTeamCore");
  return { status: 200, data: { left: true } };
}
