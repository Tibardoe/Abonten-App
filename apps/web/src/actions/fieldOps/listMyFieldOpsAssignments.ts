"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { listMyAssignmentsCore } from "@abonten/services/fieldOps/member/assignmentsCore";
import type { FieldOpsAssignment } from "@abonten/types/fieldOps";
import { fieldOpsAssignmentListSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * The signed-in member's own assignments in a campaign. Same service as
 * GET /api/mobile/field-ops/assignments.
 */
export async function listMyFieldOpsAssignments(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsAssignment[];
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsAssignmentListSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return listMyAssignmentsCore(svc, userId, {
    campaignId: data.campaignId,
    status: data.status,
  });
}
