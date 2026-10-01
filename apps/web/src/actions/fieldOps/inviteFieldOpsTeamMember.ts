"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { inviteTeamMemberCore } from "@abonten/services/fieldOps/lead/leadTeamCore";
import type { FieldOpsTeamMember } from "@abonten/types/fieldOps";
import { fieldOpsLeadInviteSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * A team lead invites a field member by phone. Same service as
 * POST /api/mobile/field-ops/lead/team.
 */
export const inviteFieldOpsTeamMember = withActionLocale(
  async function inviteFieldOpsTeamMember(input: unknown): Promise<{
    status: number;
    message?: string;
    data?: FieldOpsTeamMember;
  }> {
    const caller = await resolveFieldOpsCaller();
    if (caller.error) return caller.error;
    const { userId, svc } = caller;
    const parsed = parseFieldOpsInput(fieldOpsLeadInviteSchema, input);
    if (parsed.error) return parsed.error;
    const { data } = parsed;
    return inviteTeamMemberCore(svc, userId, data);
  },
);
