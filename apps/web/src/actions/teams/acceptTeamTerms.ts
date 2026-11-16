"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { acceptTeamTermsCore } from "@abonten/services/teams/teamCore";
import { acceptTeamTermsSchema } from "@abonten/validation/teamSchemas";

/**
 * An Owner accepts the published team terms for the team (N4). Same
 * service as POST /api/mobile/teams/[teamId]/terms.
 */
export const acceptTeamTerms = withActionLocale(async function acceptTeamTerms(
  raw: unknown,
) {
  const caller = await requireDiscoveryUser();
  if (caller.error) return caller.error;
  const input = parseDiscoveryInput(acceptTeamTermsSchema, raw);
  if (input.error) return input.error;
  return acceptTeamTermsCore(caller.svc, caller.userId, input.data);
});
