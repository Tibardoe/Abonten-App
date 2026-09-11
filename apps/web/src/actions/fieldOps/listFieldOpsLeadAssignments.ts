"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { listLeadAssignmentsCore } from "@abonten/services/fieldOps/lead/leadAssignmentsCore";
import type { FieldOpsAssignment } from "@abonten/types/fieldOps";
import { fieldOpsAssignmentListSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * The team's assignments (optionally for one day). Same service as
 * GET /api/mobile/field-ops/lead/assignments.
 */
export async function listFieldOpsLeadAssignments(input: unknown): Promise<{
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
  return listLeadAssignmentsCore(svc, userId, data);
}
