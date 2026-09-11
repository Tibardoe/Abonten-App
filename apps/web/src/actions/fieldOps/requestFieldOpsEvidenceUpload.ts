"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { requestEvidenceUploadCore } from "@abonten/services/fieldOps/member/evidenceCore";
import type { FieldOpsEvidenceUploadTicket } from "@abonten/types/fieldOps";
import { fieldOpsEvidenceRequestSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * A signed upload ticket for one evidence photo. Same service as
 * POST /api/mobile/field-ops/onboardings/[id]/evidence.
 */
export async function requestFieldOpsEvidenceUpload(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsEvidenceUploadTicket;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsEvidenceRequestSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return requestEvidenceUploadCore(svc, userId, data);
}
