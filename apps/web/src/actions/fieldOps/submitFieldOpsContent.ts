"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { submitContentCore } from "@abonten/services/fieldOps/member/contentCore";
import type { FieldOpsContentSubmission } from "@abonten/types/fieldOps";
import { fieldOpsContentSubmitSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * Send in a posted deliverable. Same service as
 * POST /api/mobile/field-ops/content.
 */
export async function submitFieldOpsContent(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsContentSubmission;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsContentSubmitSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return submitContentCore(svc, userId, data);
}
