"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { cancelTeamInviteCore } from "@abonten/services/teams/teamCore";
import { teamInviteIdSchema } from "@abonten/validation/teamSchemas";

/** An Owner withdraws an invitation still waiting. */
export const cancelTeamInvite = withActionLocale(
  async function cancelTeamInvite(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(teamInviteIdSchema, raw);
    if (input.error) return input.error;
    return cancelTeamInviteCore(caller.svc, caller.userId, input.data.inviteId);
  },
);
