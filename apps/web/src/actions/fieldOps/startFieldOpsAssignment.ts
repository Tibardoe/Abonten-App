"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { startAssignmentCore } from "@abonten/services/fieldOps/member/assignmentsCore";
import type { FieldOpsAssignment } from "@abonten/types/fieldOps";
import { fieldOpsAssignmentStartSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * Starts one of the member's assignments (offline members send their GPS
 * position). Same service as POST /api/mobile/field-ops/assignments/[id]/start.
 */
export async function startFieldOpsAssignment(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsAssignment;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsAssignmentStartSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return startAssignmentCore(svc, userId, data);
}
