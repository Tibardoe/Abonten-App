"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { setTeamMemberRoleCore } from "@abonten/services/teams/teamCore";
import { teamMemberRoleSchema } from "@abonten/validation/teamSchemas";

/** An Owner gives a member another role. */
export const setTeamMemberRole = withActionLocale(
  async function setTeamMemberRole(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(teamMemberRoleSchema, raw);
    if (input.error) return input.error;
    return setTeamMemberRoleCore(caller.svc, caller.userId, input.data);
  },
);
