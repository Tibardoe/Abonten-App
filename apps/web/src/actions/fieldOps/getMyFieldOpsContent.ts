"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { getMyContentCore } from "@abonten/services/fieldOps/member/contentCore";
import type { FieldOpsMyContent } from "@abonten/types/fieldOps";
import { fieldOpsContentListSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * The campaign's content briefs and the caller's own deliverables. Same
 * service as GET /api/mobile/field-ops/content.
 */
export async function getMyFieldOpsContent(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsMyContent | null;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsContentListSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return getMyContentCore(svc, userId, data);
}
