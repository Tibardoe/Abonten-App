"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { listLeadTeamCore } from "@abonten/services/fieldOps/lead/leadTeamCore";
import type { FieldOpsTeamMember } from "@abonten/types/fieldOps";
import { fieldOpsCampaignIdSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * The lead's team (no payout details). Same service as
 * GET /api/mobile/field-ops/lead/team.
 */
export async function listFieldOpsLeadTeam(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsTeamMember[];
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsCampaignIdSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return listLeadTeamCore(svc, userId, data.campaignId);
}
