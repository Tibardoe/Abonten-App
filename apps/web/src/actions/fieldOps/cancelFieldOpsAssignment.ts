"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { cancelAssignmentCore } from "@abonten/services/fieldOps/lead/leadAssignmentsCore";
import type { FieldOpsAssignment } from "@abonten/types/fieldOps";
import { fieldOpsAssignmentCancelSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * A team lead cancels an open assignment (reassign = cancel + create).
 * Same service as POST /api/mobile/field-ops/lead/assignments/[id]/cancel.
 */
export async function cancelFieldOpsAssignment(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsAssignment;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsAssignmentCancelSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return cancelAssignmentCore(svc, userId, data);
}
