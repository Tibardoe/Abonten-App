import { logger } from "@abonten/core/logger";
import {
  type TeamCapability,
  isTeamRole,
  teamRoleCan,
  teamRolePlaceLimited,
} from "@abonten/core/teams/roles";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  ActingTeam,
  ActingTeams,
  TeamRoleCode,
} from "@abonten/types/teamType";
import { tr } from "../i18n/requestLocale";
import {
  isAccountRestricted,
  restrictedAccountMessage,
} from "../security/accountStatus";
import { isTeamsKillSwitchOn, resolveTeamAccess } from "./teamProgram";

// Who an organizer or place request is made for (docs/architecture/
// team-accounts.md, stage 2). A signed-in person acts for themselves, or —
// when the website's "Managing as" choice or the app's header names a team
// — for that team, if they are an active member of the active team in a
// role that covers what the request does. The account it returns is the one
// the request reads and writes as (event.organizer_id, place.owner_id); the
// person stays the one signed in, so the database's access rules
// (public.acting_accounts) and the activity record still know who did it.
//
// Anything that does not ask for an account here keeps acting for the
// person: a team is reached only through a request that names the
// capability it needs, so an unconverted screen can never act for a team.

export type ActingAccount = {
  /** The signed-in person. */
  personId: string;
  /** Who the request reads and writes as: the person, or their team. */
  accountId: string;
  /** The person's role in the team, or null when acting for themselves. */
  role: TeamRoleCode | null;
  /**
   * Front desk and Door staff limited to some of the team's places (a
   * chain): those places. Null = no limit (all the account's places).
   */
  placeIds?: string[] | null;
};

/** Whether the actor reaches this place (a limited member: theirs only). */
export function actorReachesPlace(
  actor: Pick<ActingAccount, "placeIds">,
  placeId: string,
): boolean {
  return !actor.placeIds || actor.placeIds.includes(placeId);
}

/**
 * Whether the actor reaches this event: a member limited to places reaches
 * only the events held at them.
 */
export async function actorReachesEvent(
  svc: ServiceRoleClient,
  actor: Pick<ActingAccount, "placeIds">,
  eventId: string,
): Promise<boolean> {
  if (!actor.placeIds) return true;
  const { data } = await svc
    .from("event")
    .select("place_id")
    .eq("id", eventId)
    .maybeSingle();
  return !!data?.place_id && actor.placeIds.includes(data.place_id);
}

export type ActingFailure = { status: 403 | 404 | 409; message: string };

export async function resolveActingAccount(
  svc: ServiceRoleClient,
  personId: string,
  requestedAccountId: string | null | undefined,
  /** What the request does; a list means any one of them is enough. */
  capability: TeamCapability | readonly TeamCapability[],
  /** `all`: the role must cover every capability in the list. */
  options: { all?: boolean } = {},
): Promise<
  { ok: true; actor: ActingAccount } | { ok: false; error: ActingFailure }
> {
  if (!requestedAccountId || requestedAccountId === personId) {
    return { ok: true, actor: { personId, accountId: personId, role: null } };
  }
  if (isTeamsKillSwitchOn()) {
    return {
      ok: false,
      error: { status: 403, message: tr("teamsUnavailable") },
    };
  }
  const { data, error } = await svc
    .from("team_member")
    .select("role, team:team_id(status)")
    .eq("team_id", requestedAccountId)
    .eq("user_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (error) logger.error(`resolveActingAccount: ${error.message}`);
  const row = data as unknown as {
    role: string;
    team: { status: string } | null;
  } | null;
  if (!row || !isTeamRole(row.role)) {
    // A team its Owners (or staff) deleted: everyone who managed as it is
    // back on their own account, quietly (the website's Manage menu and the
    // app's "Managing as" already read a team the person is no longer in as
    // their own account). Any other team they are not in is refused.
    const { data: gone } = await svc
      .from("team")
      .select("status")
      .eq("account_id", requestedAccountId)
      .maybeSingle();
    if (gone?.status === "closed") {
      return { ok: true, actor: { personId, accountId: personId, role: null } };
    }
    return { ok: false, error: { status: 404, message: tr("teamNotFound") } };
  }
  if (row.team?.status !== "active") {
    return { ok: false, error: { status: 409, message: tr("teamFrozen") } };
  }
  const role = row.role;
  const caps = typeof capability === "string" ? [capability] : capability;
  const covered = options.all
    ? caps.every((c) => teamRoleCan(role, c))
    : caps.some((c) => teamRoleCan(role, c));
  if (!covered) {
    return {
      ok: false,
      error: { status: 403, message: tr("teamRoleCannot") },
    };
  }
  // The person's own standing still counts when they act for a team.
  if (await isAccountRestricted(personId)) {
    return {
      ok: false,
      error: { status: 403, message: restrictedAccountMessage() },
    };
  }
  // A Front desk or Door staff member may be limited to some places.
  let placeIds: string[] | null = null;
  if (teamRolePlaceLimited(role)) {
    const { data: limits, error: limitError } = await svc
      .from("team_member_place")
      .select("place_id")
      .eq("team_id", requestedAccountId)
      .eq("user_id", personId);
    if (limitError) logger.error(`resolveActingAccount: ${limitError.message}`);
    const ids = (limits ?? []).map((l) => l.place_id as string);
    placeIds = ids.length > 0 ? ids : null;
  }
  return {
    ok: true,
    actor: {
      personId,
      accountId: requestedAccountId,
      role: row.role,
      placeIds,
    },
  };
}

/** The teams a person may manage as, for the "Managing as" choice. */
export async function listActingTeams(
  svc: ServiceRoleClient,
  personId: string,
): Promise<ActingTeam[]> {
  const { data, error } = await svc
    .from("team_member")
    .select(
      "role, team:team_id!inner(status, profile:user_info!team_account_id_fkey(id, full_name, username, avatar_public_id, avatar_version))",
    )
    .eq("user_id", personId)
    .eq("status", "active")
    .eq("team.status", "active")
    .limit(50);
  if (error) {
    logger.error(`listActingTeams: ${error.message}`);
    return [];
  }
  type Row = {
    role: string;
    team: {
      profile: {
        id: string;
        full_name: string | null;
        username: string | null;
        avatar_public_id: string | null;
        avatar_version: string | null;
      } | null;
    } | null;
  };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.team?.profile && isTeamRole(r.role))
    .map((r) => ({
      id: r.team?.profile?.id as string,
      name: r.team?.profile?.full_name ?? null,
      username: r.team?.profile?.username ?? null,
      avatarPublicId: r.team?.profile?.avatar_public_id ?? null,
      avatarVersion: r.team?.profile?.avatar_version ?? null,
      role: r.role as TeamRoleCode,
    }));
}

/**
 * The "Managing as" choice for the website's Manage menu and the app's
 * organizer screens: the person's teams and whether teams are on at all.
 */
export async function getActingTeamsCore(
  svc: ServiceRoleClient,
  personId: string,
): Promise<{ status: 200; data: ActingTeams }> {
  const [teams, access] = await Promise.all([
    listActingTeams(svc, personId),
    resolveTeamAccess(svc, personId),
  ]);
  return {
    status: 200,
    data: { teams, programEnabled: access.program.enabled },
  };
}
