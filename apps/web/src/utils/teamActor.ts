import "server-only";

import { createClient } from "@/config/supabase/server";
import type { TeamCapability } from "@abonten/core/teams/roles";
import { tr } from "@abonten/services/i18n/requestLocale";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import {
  listActingTeams,
  resolveActingAccount,
} from "@abonten/services/teams/actingAccount";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { TeamRoleCode } from "@abonten/types/teamType";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// "Managing as" on the website (docs/architecture/team-accounts.md, stage
// 2). The choice is a cookie holding a team id; it only ever selects, and
// every request re-checks the membership and the role
// (resolveActingAccount), so a stale or forged cookie can do nothing the
// person's role does not allow. Only the organizer and place screens read
// it: tickets, messages and everything personal ignore it.

export const ACTING_TEAM_COOKIE = "abn_team";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The team the person chose to manage as, if any (unchecked). */
export async function readActingTeamId(): Promise<string | null> {
  const value = (await cookies()).get(ACTING_TEAM_COOKIE)?.value ?? "";
  return UUID.test(value) ? value : null;
}

export type Actor = {
  /** The signed-in person's client: the access rules see them. */
  supabase: SupabaseClient<Database>;
  svc: ServiceRoleClient;
  personId: string;
  /** Who the request reads and writes as. */
  accountId: string;
  role: TeamRoleCode | null;
};

/**
 * For an action that already proved the person: the account this request
 * is made for (their own, or the chosen team when their role covers
 * `capability`), or the envelope to return.
 */
export async function actingFor(
  personId: string,
  capability: TeamCapability | readonly TeamCapability[],
  /** `all`: the role must cover every capability in the list. */
  options: { all?: boolean } = {},
): Promise<
  | { error: null; accountId: string; role: TeamRoleCode | null }
  | { error: { status: 403; message: string } }
> {
  const teamId = await readActingTeamId();
  if (!teamId) return { error: null, accountId: personId, role: null };
  const resolved = await resolveActingAccount(
    getSupabaseServiceClient(),
    personId,
    teamId,
    capability,
    options,
  );
  // One answer for every "you can't act for this team here" (gone, paused,
  // role): the action's own envelope types already carry a 403.
  if (!resolved.ok) {
    return { error: { status: 403, message: resolved.error.message } };
  }
  return {
    error: null,
    accountId: resolved.actor.accountId,
    role: resolved.actor.role,
  };
}

/**
 * The signed-in person and the account this organizer or place request is
 * made for, if their role covers `capability`. A 401 when nobody is signed
 * in; a 403/404/409 envelope when the chosen team cannot be acted for.
 */
export async function requireActor(
  capability: TeamCapability | readonly TeamCapability[],
): Promise<
  | ({ error: null } & Actor)
  | { error: { status: 401 | 403 | 404 | 409; message: string } }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: { status: 401, message: tr("userNotAuthenticated") } };
  }
  const svc = getSupabaseServiceClient();
  const resolved = await resolveActingAccount(
    svc,
    user.id,
    await readActingTeamId(),
    capability,
  );
  if (!resolved.ok) return { error: resolved.error };
  return { error: null, supabase, svc, ...resolved.actor };
}

/**
 * Who a listing belongs to, among the accounts the person can manage as:
 * their own, one of their teams, or neither. A manage page that refuses
 * because the person is managing as someone else offers to switch.
 */
export async function managingTargetFor(
  personId: string,
  ownerId: string,
): Promise<
  { kind: "own" } | { kind: "team"; teamId: string; name: string } | null
> {
  if (ownerId === personId) return { kind: "own" };
  const teams = await listActingTeams(getSupabaseServiceClient(), personId);
  const team = teams.find((t) => t.id === ownerId);
  return team
    ? { kind: "team", teamId: team.id, name: team.name ?? team.username ?? "" }
    : null;
}

/**
 * The team whose inbox the person answers while managing as it (stage 4),
 * or null for their own inbox. Never an error: a role that does not answer
 * messages simply keeps the person's own inbox.
 */
export async function teamInboxAccount(
  personId: string,
): Promise<string | null> {
  const teamId = await readActingTeamId();
  if (!teamId) return null;
  const resolved = await resolveActingAccount(
    getSupabaseServiceClient(),
    personId,
    teamId,
    "messages.reply",
  );
  return resolved.ok && resolved.actor.role ? resolved.actor.accountId : null;
}
