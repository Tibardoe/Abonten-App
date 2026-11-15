"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { leaveTeamCore } from "@abonten/services/teams/teamCore";
import { teamIdSchema } from "@abonten/validation/teamSchemas";

/** The person leaves a team. The last Owner names another Owner first. */
export const leaveTeam = withActionLocale(async function leaveTeam(
  raw: unknown,
) {
  const caller = await requireDiscoveryUser();
  if (caller.error) return caller.error;
  const input = parseDiscoveryInput(teamIdSchema, raw);
  if (input.error) return input.error;
  const result = await leaveTeamCore(
    caller.svc,
    caller.userId,
    input.data.teamId,
  );
  if (result.status === 200) revalidateAppPath("/settings/teams");
  return result;
});
