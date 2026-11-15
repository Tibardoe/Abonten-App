"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { ACTING_TEAM_COOKIE } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import { listActingTeams } from "@abonten/services/teams/actingAccount";
import { actingTeamSchema } from "@abonten/validation/teamSchemas";
import { cookies } from "next/headers";

/**
 * "Managing as": the person's own account (teamId null) or one of their
 * teams. Saved as a cookie that only selects; every organizer and place
 * request re-checks the membership and the role.
 */
export const setActingTeam = withActionLocale(async function setActingTeam(
  raw: unknown,
) {
  const caller = await requireDiscoveryUser();
  if (caller.error) return caller.error;
  const input = parseDiscoveryInput(actingTeamSchema, raw);
  if (input.error) return input.error;
  const jar = await cookies();
  if (!input.data.teamId) {
    jar.delete(ACTING_TEAM_COOKIE);
  } else {
    const teams = await listActingTeams(caller.svc, caller.userId);
    if (!teams.some((t) => t.id === input.data.teamId)) {
      return { status: 404 as const, message: tr("teamNotFound") };
    }
    jar.set(ACTING_TEAM_COOKIE, input.data.teamId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  revalidateAppPath("/manage", "layout");
  return { status: 200 as const, data: { teamId: input.data.teamId } };
});
