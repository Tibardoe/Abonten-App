"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { removeEvidenceCore } from "@abonten/services/fieldOps/member/evidenceCore";
import { fieldOpsEvidenceRemoveSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * Removes an evidence photo from a draft. Same service as
 * DELETE /api/mobile/field-ops/onboardings/[id]/evidence/[evidenceId].
 */
export async function removeFieldOpsEvidence(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: { removed: boolean };
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsEvidenceRemoveSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return removeEvidenceCore(svc, userId, data);
}
