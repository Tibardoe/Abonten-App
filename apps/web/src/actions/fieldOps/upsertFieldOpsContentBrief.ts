"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { upsertContentBriefCore } from "@abonten/services/fieldOps/lead/contentLeadCore";
import type { FieldOpsContentBrief } from "@abonten/types/fieldOps";
import { fieldOpsContentBriefSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * The team lead writes or edits a brief. Same service as
 * POST /api/mobile/field-ops/lead/content/briefs.
 */
export async function upsertFieldOpsContentBrief(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsContentBrief;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsContentBriefSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return upsertContentBriefCore(svc, userId, data);
}
