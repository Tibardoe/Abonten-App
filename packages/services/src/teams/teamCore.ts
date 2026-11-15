import { randomUUID } from "node:crypto";
import { logger } from "@abonten/core/logger";
import { parsePhone } from "@abonten/core/phone";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  InviteTarget,
  TeamActivityEntry,
  TeamDetail,
  TeamInviteReceived,
  TeamInviteSent,
  TeamMember,
  TeamPerson,
  TeamRoleCode,
  TeamStatus,
  TeamSummary,
  TeamsOverview,
} from "@abonten/types/teamType";
import type { TicketTransferRecipient } from "@abonten/types/ticketTransferType";
import { tr } from "../i18n/requestLocale";
import {
  isAccountRestricted,
  restrictedAccountMessage,
} from "../security/accountStatus";
import { maskPhone } from "../ticketTransfers/ticketTransferCore";
import {
  noticeTeamInviteAccepted,
  noticeTeamInviteReceived,
  noticeTeamMemberRemoved,
  noticeTeamRoleChanged,
  textTeamInvite,
} from "./teamNotices";
import { isTeamsKillSwitchOn, resolveTeamAccess } from "./teamProgram";

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
type Ok<T> = { status: 200; data: T };

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
};

/** Turns a `team:<code>` database error into an envelope. */
function failFromDb(error: { message?: string } | null, where: string): Fail {
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

async function activeMembership(
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
    svc.from("user_info").select(PERSON_SELECT).in("id", ids),
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
    ((profiles.data ?? []) as PersonRow[]).map((p) => [p.id, p]),
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
  return { status: 200, data: { program, teams, invites } };
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

  const [summary, members, invites, activity] = await Promise.all([
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
  const memberSubjects = activityRows
    .filter((a) => a.subject_kind === "member" && a.subject_id)
    .map((a) => a.subject_id as string);

  const [persons, idChecks] = await Promise.all([
    people(svc, [
      ...memberRows.map((m) => m.user_id),
      ...inviteRows.map((i) => i.to_user_id),
      ...inviteRows.map((i) => i.invited_by),
      ...activityRows.map((a) => a.actor_user_id),
      ...memberSubjects,
    ]),
    svc
      .from("user_info")
      .select("id, identity_verified")
      .in(
        "id",
        memberRows.map((m) => m.user_id),
      ),
  ]);
  const checked = new Map(
    (idChecks.data ?? []).map((r) => [r.id, r.identity_verified === true]),
  );

  const memberList: TeamMember[] = [];
  for (const m of memberRows) {
    const person = persons.get(m.user_id);
    if (!person) continue;
    memberList.push({
      person,
      role: m.role as TeamRoleCode,
      joinedAt: m.joined_at,
      idChecked: checked.get(m.user_id) ?? false,
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
          a.subject_kind === "member" && a.subject_id
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
    },
  };
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
  input: { name: string; username: string },
): Promise<Ok<TeamSummary> | Fail> {
  const access = await resolveTeamAccess(svc, userId);
  if (!access.program.enabled) return unavailable();
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

export async function renameTeamCore(
  svc: ServiceRoleClient,
  userId: string,
  input: { teamId: string; name: string },
): Promise<Ok<{ name: string }> | Fail> {
  if (await isAccountRestricted(userId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }
  const { error } = await svc.rpc("team_rename", {
    p_team: input.teamId,
    p_by: userId,
    p_name: input.name,
  });
  if (error) return failFromDb(error, "renameTeamCore");
  return { status: 200, data: { name: input.name } };
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
  input: { inviteId: string; action: "accept" | "decline" },
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
    await noticeTeamRoleChanged(input.teamId, input.userId, input.role);
  }
  return { status: 200, data: { role: input.role } };
}

/** An Owner removes a member; their access to the team ends at once. */
export async function removeTeamMemberCore(
  svc: ServiceRoleClient,
  userId: string,
  input: { teamId: string; userId: string },
): Promise<Ok<{ removed: true }> | Fail> {
  const { error } = await svc.rpc("team_member_remove", {
    p_team: input.teamId,
    p_by: userId,
    p_user: input.userId,
  });
  if (error) return failFromDb(error, "removeTeamMemberCore");
  await noticeTeamMemberRemoved(input.teamId, input.userId);
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
