"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { getLeadDashboardCore } from "@abonten/services/fieldOps/lead/leadDashboardQuery";
import type { FieldOpsLeadDashboard } from "@abonten/types/fieldOps";
import { fieldOpsCampaignIdSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * The team lead's coverage board, today's assignments and team headcount.
 * Same service as GET /api/mobile/field-ops/lead/dashboard.
 */
export async function getFieldOpsLeadDashboard(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsLeadDashboard;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsCampaignIdSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return getLeadDashboardCore(svc, userId, data.campaignId);
}
