"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { getLeadPerformanceCore } from "@abonten/services/fieldOps/lead/performanceQuery";
import type { FieldOpsAnalytics } from "@abonten/types/fieldOps";
import { fieldOpsCampaignIdSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * The lead's team and territory figures. Same service as
 * GET /api/mobile/field-ops/lead/performance.
 */
export async function getFieldOpsLeadPerformance(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsAnalytics;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsCampaignIdSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return getLeadPerformanceCore(svc, userId, data);
}
