"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { createTeamCore } from "@abonten/services/teams/teamCore";
import { createTeamSchema } from "@abonten/validation/teamSchemas";

/** Makes a team run by the person as its first Owner. */
export const createTeam = withActionLocale(async function createTeam(
  raw: unknown,
) {
  const caller = await requireDiscoveryUser();
  if (caller.error) return caller.error;
  const input = parseDiscoveryInput(createTeamSchema, raw);
  if (input.error) return input.error;
  const result = await createTeamCore(caller.svc, caller.userId, input.data);
  if (result.status === 200) revalidateAppPath("/settings/teams");
  return result;
});
