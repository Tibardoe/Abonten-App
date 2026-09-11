"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { createAssignmentCore } from "@abonten/services/fieldOps/lead/leadAssignmentsCore";
import type { FieldOpsAssignment } from "@abonten/types/fieldOps";
import { fieldOpsAssignmentCreateSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * A team lead assigns a member to a territory for a date range. Same
 * service as POST /api/mobile/field-ops/lead/assignments.
 */
export async function createFieldOpsAssignment(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsAssignment;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsAssignmentCreateSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return createAssignmentCore(svc, userId, data);
}
