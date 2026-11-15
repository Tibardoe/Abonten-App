"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { removeTeamMemberCore } from "@abonten/services/teams/teamCore";
import { teamMemberSchema } from "@abonten/validation/teamSchemas";

/** An Owner removes a member; their access ends at once. */
export const removeTeamMember = withActionLocale(
  async function removeTeamMember(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(teamMemberSchema, raw);
    if (input.error) return input.error;
    return removeTeamMemberCore(caller.svc, caller.userId, input.data);
  },
);
