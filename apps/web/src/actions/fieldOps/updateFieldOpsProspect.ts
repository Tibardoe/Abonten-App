"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { updateProspectCore } from "@abonten/services/fieldOps/member/prospectsCore";
import type { FieldOpsProspect } from "@abonten/types/fieldOps";
import { fieldOpsProspectUpdateSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * Updates the member's own prospect (status, a contact attempt, details).
 * Same service as PATCH /api/mobile/field-ops/prospects/[id].
 */
export async function updateFieldOpsProspect(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsProspect;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsProspectUpdateSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return updateProspectCore(svc, userId, data);
}
