import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  TeamAdminSettings,
  TeamAudience,
  TeamProgram,
} from "@abonten/types/teamType";
import { ticketPlanAudienceIncludes } from "../ticketPlans/ticketPlanProgram";

// Programme switches for team accounts (decision X43), the same shape as
// sending tickets: one settings row plus a deploy-level kill switch that
// wins over it, with the audience resolved here against the user id the
// transport already proved.
//
// What each switch stops:
//   * `enabled` off, or a person outside the audience: no NEW team and no
//     new invitation. Members of a team that exists can still see it,
//     answer invitations, leave, and Owners can still remove members:
//     switching the programme off must never trap anyone in a team.
//   * TEAMS_KILL_SWITCH (an emergency stop): the same, plus nobody can
//     accept an invitation.

export type TeamSettingRow =
  Database["public"]["Tables"]["team_program_setting"]["Row"];

const SETTINGS_TTL_MS = 15_000;
let cached: { row: TeamSettingRow | null; at: number } | null = null;

export const TEAM_DEFAULTS = {
  maxTeamsCreated: 5,
  maxMembers: 50,
  inviteHours: 168,
  textsPerTeamPerDay: 20,
};

export function isTeamsKillSwitchOn(): boolean {
  return process.env.TEAMS_KILL_SWITCH === "true";
}

/** Test hook: forget the cached settings row. */
export function resetTeamSettingsCache(): void {
  cached = null;
}

export async function readTeamSettings(
  supabase: ServiceRoleClient,
  options: { fresh?: boolean } = {},
): Promise<TeamSettingRow | null> {
  if (!options.fresh && cached && Date.now() - cached.at < SETTINGS_TTL_MS) {
    return cached.row;
  }
  const { data, error } = await supabase
    .from("team_program_setting")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    logger.error(`readTeamSettings failed: ${error.message}`);
    return null;
  }
  cached = { row: data ?? null, at: Date.now() };
  return data ?? null;
}

async function isStaff(
  supabase: ServiceRoleClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("admin_user")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.status === "active";
}

export type TeamAccess = {
  program: TeamProgram;
  maxTeamsCreated: number;
  maxMembers: number;
  inviteHours: number;
  textsPerTeamPerDay: number;
};

export async function resolveTeamAccess(
  supabase: ServiceRoleClient,
  userId: string | null,
): Promise<TeamAccess> {
  const row = isTeamsKillSwitchOn() ? null : await readTeamSettings(supabase);
  const limits = {
    maxTeamsCreated: row?.max_teams_created ?? TEAM_DEFAULTS.maxTeamsCreated,
    maxMembers: row?.max_members ?? TEAM_DEFAULTS.maxMembers,
    inviteHours: row?.invite_hours ?? TEAM_DEFAULTS.inviteHours,
    textsPerTeamPerDay:
      row?.texts_per_team_per_day ?? TEAM_DEFAULTS.textsPerTeamPerDay,
  };
  if (!row || !row.enabled) {
    return { program: { enabled: false }, ...limits };
  }
  const enabled = await ticketPlanAudienceIncludes(
    row.audience,
    row.beta_user_ids ?? [],
    userId,
    (id) => isStaff(supabase, id),
  );
  return { program: { enabled }, ...limits };
}

export function mapTeamSettings(row: TeamSettingRow): TeamAdminSettings {
  return {
    enabled: row.enabled,
    audience: row.audience as TeamAudience,
    betaUserIds: row.beta_user_ids ?? [],
    maxTeamsCreated: row.max_teams_created,
    maxMembers: row.max_members,
    inviteHours: row.invite_hours,
    textsPerTeamPerDay: row.texts_per_team_per_day,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}
