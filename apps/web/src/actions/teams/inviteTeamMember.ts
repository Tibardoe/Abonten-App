"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { canTextNumber } from "@abonten/services/safety/safetyPeople";
import { inviteTeamMemberCore } from "@abonten/services/teams/teamCore";
import { inviteTeamMemberSchema } from "@abonten/validation/teamSchemas";

/** An Owner invites someone, by username or phone number, in a role. */
export const inviteTeamMember = withActionLocale(
  async function inviteTeamMember(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(inviteTeamMemberSchema, raw);
    if (input.error) return input.error;
    return inviteTeamMemberCore(caller.svc, caller.userId, input.data, {
      canTextNumber,
    });
  },
);
