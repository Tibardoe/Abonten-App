"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { getTeamCore } from "@abonten/services/teams/teamCore";
import { teamIdSchema } from "@abonten/validation/teamSchemas";

/** One team as its member sees it; Owners also get invitations and activity. */
export const getTeam = withActionLocale(async function getTeam(raw: unknown) {
  const caller = await requireDiscoveryUser();
  if (caller.error) return caller.error;
  const input = parseDiscoveryInput(teamIdSchema, raw);
  if (input.error) return input.error;
  return getTeamCore(caller.svc, caller.userId, input.data.teamId);
});
