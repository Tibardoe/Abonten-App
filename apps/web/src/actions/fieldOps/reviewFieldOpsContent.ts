"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { reviewContentCore } from "@abonten/services/fieldOps/lead/contentLeadCore";
import type { FieldOpsContentSubmission } from "@abonten/types/fieldOps";
import { fieldOpsContentReviewSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * The team lead approves or rejects a deliverable. Same service as
 * POST /api/mobile/field-ops/lead/content/[submissionId].
 */
export async function reviewFieldOpsContent(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsContentSubmission;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsContentReviewSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return reviewContentCore(svc, userId, data);
}
