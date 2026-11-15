"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { renameTeamCore } from "@abonten/services/teams/teamCore";
import { renameTeamSchema } from "@abonten/validation/teamSchemas";

/** An Owner renames the team. */
export const renameTeam = withActionLocale(async function renameTeam(
  raw: unknown,
) {
  const caller = await requireDiscoveryUser();
  if (caller.error) return caller.error;
  const input = parseDiscoveryInput(renameTeamSchema, raw);
  if (input.error) return input.error;
  return renameTeamCore(caller.svc, caller.userId, input.data);
});
