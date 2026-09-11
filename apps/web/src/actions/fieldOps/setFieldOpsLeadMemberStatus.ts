"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { setLeadMemberStatusCore } from "@abonten/services/fieldOps/lead/leadTeamCore";
import { fieldOpsLeadMemberStatusSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * A team lead suspends, reactivates or removes a member of their team.
 * Same service as PATCH /api/mobile/field-ops/lead/team/[id].
 */
export async function setFieldOpsLeadMemberStatus(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: { status: string };
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsLeadMemberStatusSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return setLeadMemberStatusCore(svc, userId, data);
}
