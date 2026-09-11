"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { completeAssignmentCore } from "@abonten/services/fieldOps/member/assignmentsCore";
import type { FieldOpsAssignment } from "@abonten/types/fieldOps";
import { fieldOpsAssignmentCompleteSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * Marks a started assignment completed. Same service as
 * POST /api/mobile/field-ops/assignments/[id]/complete.
 */
export async function completeFieldOpsAssignment(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsAssignment;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsAssignmentCompleteSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return completeAssignmentCore(svc, userId, data);
}
