"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { listLeadTerritoriesCore } from "@abonten/services/fieldOps/lead/leadTerritoriesCore";
import type { FieldOpsTerritory } from "@abonten/types/fieldOps";
import { fieldOpsCampaignIdSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * Every territory in the lead's campaign region. Same service as
 * GET /api/mobile/field-ops/lead/territories.
 */
export async function listFieldOpsLeadTerritories(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsTerritory[];
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsCampaignIdSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return listLeadTerritoriesCore(svc, userId, data.campaignId);
}
