import { logger } from "@abonten/core/logger";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  TeamAdminRow,
  TeamAdminSettings,
  TeamPerson,
  TeamRoleCode,
  TeamStatus,
} from "@abonten/types/teamType";
import type { TeamSettingsInput } from "@abonten/validation/teamSchemas";
import {
  isTeamsKillSwitchOn,
  mapTeamSettings,
  readTeamSettings,
  resetTeamSettingsCache,
} from "../../teams/teamProgram";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// Admin › Teams (docs/architecture/team-accounts.md): the programme
// switches and limits, and every team with its members, open invitations
// and activity, so support can answer "who runs this organizer?". Staff do
// not change members here yet (disputes and frozen teams come with stage
// 5). Every settings change is audited.

type RequestMeta = Record<string, unknown> | undefined;

const denied = <T>(e: unknown): AdminEnvelope<T> =>
  adminError(e) as AdminEnvelope<T>;

type PersonRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_public_id: string | null;
  avatar_version: string | null;
};

const toPerson = (r: PersonRow): TeamPerson => ({
  id: r.id,
  name: r.full_name,
  username: r.username,
  avatarPublicId: r.avatar_public_id,
  avatarVersion: r.avatar_version,
});

async function people(
  supabase: ServiceRoleClient,
  ids: (string | null)[],
): Promise<Map<string, TeamPerson>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const { data } = await supabase
    .from("user_info")
    .select("id, full_name, username, avatar_public_id, avatar_version")
    .in("id", unique);
  return new Map(((data ?? []) as PersonRow[]).map((r) => [r.id, toPerson(r)]));
}

export async function getTeamSettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<
  AdminEnvelope<{ settings: TeamAdminSettings; killSwitch: boolean }>
> {
  try {
    assertPermission(ctx, "teams.view");
  } catch (e) {
    return denied(e);
  }
  const row = await readTeamSettings(supabase, { fresh: true }).catch(
    () => null,
  );
  if (!row) return { status: 500, message: "Couldn't load the settings." };
  return {
    status: 200,
    data: { settings: mapTeamSettings(row), killSwitch: isTeamsKillSwitchOn() },
  };
}

const COLUMN: Record<keyof TeamSettingsInput["patch"], string> = {
  enabled: "enabled",
  audience: "audience",
  betaUserIds: "beta_user_ids",
  maxTeamsCreated: "max_teams_created",
  maxMembers: "max_members",
  inviteHours: "invite_hours",
  textsPerTeamPerDay: "texts_per_team_per_day",
};

export async function updateTeamSettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: TeamSettingsInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<TeamAdminSettings>> {
  try {
    assertPermission(ctx, "teams.configure");
  } catch (e) {
    return denied(e);
  }
  const beforeRow = await readTeamSettings(supabase, { fresh: true }).catch(
    () => null,
  );
  if (!beforeRow)
    return { status: 500, message: "Couldn't load the settings." };
  const before = mapTeamSettings(beforeRow);

  const update: Record<string, unknown> = {};
  const changed: (keyof TeamAdminSettings)[] = [];
  for (const [key, value] of Object.entries(input.patch)) {
    const column = COLUMN[key as keyof typeof COLUMN];
    if (!column || value === undefined) continue;
    if (
      JSON.stringify(before[key as keyof TeamAdminSettings]) ===
      JSON.stringify(value)
    ) {
      continue;
    }
    update[column] = value;
    changed.push(key as keyof TeamAdminSettings);
  }
  if (changed.length === 0) return { status: 400, message: "Nothing changed." };
  update.updated_at = new Date().toISOString();
  update.updated_by = ctx.userId;

  const { data, error } = await supabase
    .from("team_program_setting")
    .update(update as never)
    .eq("id", 1)
    .eq("updated_at", input.expectedUpdatedAt)
    .select("*")
    .maybeSingle();
  if (error) {
    logger.error(`updateTeamSettingsCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't save the settings." };
  }
  if (!data) {
    return {
      status: 409,
      message: "Someone else changed these settings. Reload and try again.",
    };
  }
  resetTeamSettingsCache();
  const after = mapTeamSettings(data);
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "teams.settings.update",
    targetType: "team_program_setting",
    targetId: "1",
    summary: `Team settings changed: ${changed.join(", ")}`,
    reason: input.reason,
    before: Object.fromEntries(changed.map((k) => [k, before[k]])),
    after: Object.fromEntries(changed.map((k) => [k, after[k]])),
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: "Settings saved.", data: after };
}

/** Teams, newest first; `q` matches the team's name or username. */
export async function listTeamsAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filter: { q?: string | null; limit?: number },
): Promise<AdminEnvelope<TeamAdminRow[]>> {
  try {
    assertPermission(ctx, "teams.view");
  } catch (e) {
    return denied(e);
  }
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  let ids: string[] | null = null;
  const q = (filter.q ?? "").trim().replace(/[^\p{L}\p{N}_ .'-]/gu, "");
  if (q) {
    const { data, error } = await supabase
      .from("user_info")
      .select("id")
      .eq("account_kind", "team")
      .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(limit);
    if (error) {
      logger.error(`listTeamsAdminCore search: ${error.message}`);
      return { status: 500, message: "Couldn't search teams." };
    }
    ids = (data ?? []).map((r) => r.id);
    if (ids.length === 0) return { status: 200, data: [] };
  }
  let query = supabase
    .from("team")
    .select("account_id, status, status_reason, created_at, created_by")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (ids) query = query.in("account_id", ids);
  const { data: teams, error } = await query;
  if (error) {
    logger.error(`listTeamsAdminCore: ${error.message}`);
    return { status: 500, message: "Couldn't load teams." };
  }
  const rows = teams ?? [];
  if (rows.length === 0) return { status: 200, data: [] };
  const teamIds = rows.map((t) => t.account_id);
  const { data: members } = await supabase
    .from("team_member")
    .select("team_id, user_id, role")
    .in("team_id", teamIds)
    .eq("status", "active");
  const persons = await people(supabase, [
    ...teamIds,
    ...rows.map((t) => t.created_by),
    ...(members ?? []).map((m) => m.user_id),
  ]);
  return {
    status: 200,
    data: rows.map((t) => {
      const own = (members ?? []).filter((m) => m.team_id === t.account_id);
      const profile = persons.get(t.account_id);
      return {
        id: t.account_id,
        name: profile?.name ?? null,
        username: profile?.username ?? null,
        status: t.status as TeamStatus,
        statusReason: t.status_reason,
        createdAt: t.created_at,
        createdBy: t.created_by ? (persons.get(t.created_by) ?? null) : null,
        owners: own
          .filter((m) => m.role === "owner")
          .map((m) => persons.get(m.user_id))
          .filter((p): p is TeamPerson => !!p),
        memberCount: own.length,
      };
    }),
  };
}

export type TeamAdminDetail = {
  team: TeamAdminRow;
  members: { person: TeamPerson; role: TeamRoleCode; joinedAt: string }[];
  activity: {
    id: number;
    actor: TeamPerson | null;
    action: string;
    subject: TeamPerson | null;
    details: Record<string, unknown>;
    createdAt: string;
  }[];
};

export async function getTeamAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  teamId: string,
): Promise<AdminEnvelope<TeamAdminDetail>> {
  try {
    assertPermission(ctx, "teams.view");
  } catch (e) {
    return denied(e);
  }
  const { data: team, error } = await supabase
    .from("team")
    .select("account_id, status, status_reason, created_at, created_by")
    .eq("account_id", teamId)
    .maybeSingle();
  if (error) return { status: 500, message: "Couldn't load the team." };
  if (!team) return { status: 404, message: "Team not found." };
  const [members, activity] = await Promise.all([
    supabase
      .from("team_member")
      .select("user_id, role, joined_at")
      .eq("team_id", teamId)
      .eq("status", "active")
      .order("joined_at"),
    supabase
      .from("team_activity")
      .select(
        "id, actor_user_id, action, subject_kind, subject_id, details, created_at",
      )
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  const memberRows = members.data ?? [];
  const activityRows = activity.data ?? [];
  const persons = await people(supabase, [
    teamId,
    team.created_by,
    ...memberRows.map((m) => m.user_id),
    ...activityRows.map((a) => a.actor_user_id),
    ...activityRows
      .filter((a) => a.subject_kind === "member")
      .map((a) => a.subject_id),
  ]);
  const profile = persons.get(teamId);
  return {
    status: 200,
    data: {
      team: {
        id: teamId,
        name: profile?.name ?? null,
        username: profile?.username ?? null,
        status: team.status as TeamStatus,
        statusReason: team.status_reason,
        createdAt: team.created_at,
        createdBy: team.created_by
          ? (persons.get(team.created_by) ?? null)
          : null,
        owners: memberRows
          .filter((m) => m.role === "owner")
          .map((m) => persons.get(m.user_id))
          .filter((p): p is TeamPerson => !!p),
        memberCount: memberRows.length,
      },
      members: memberRows
        .map((m) => ({
          person: persons.get(m.user_id),
          role: m.role as TeamRoleCode,
          joinedAt: m.joined_at,
        }))
        .filter(
          (
            m,
          ): m is {
            person: TeamPerson;
            role: TeamRoleCode;
            joinedAt: string;
          } => !!m.person,
        ),
      activity: activityRows.map((a) => ({
        id: a.id,
        actor: a.actor_user_id ? (persons.get(a.actor_user_id) ?? null) : null,
        action: a.action,
        subject:
          a.subject_kind === "member" && a.subject_id
            ? (persons.get(a.subject_id) ?? null)
            : null,
        details: (a.details ?? {}) as Record<string, unknown>,
        createdAt: a.created_at,
      })),
    },
  };
}
