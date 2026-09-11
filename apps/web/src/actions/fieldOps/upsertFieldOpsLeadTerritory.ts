"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { upsertLeadTerritoryCore } from "@abonten/services/fieldOps/lead/leadTerritoriesCore";
import type { FieldOpsTerritory } from "@abonten/types/fieldOps";
import { fieldOpsLeadTerritorySchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * A team lead adds or edits a town/area in their campaign's region. Same
 * service as POST /api/mobile/field-ops/lead/territories.
 */
export async function upsertFieldOpsLeadTerritory(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsTerritory;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsLeadTerritorySchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return upsertLeadTerritoryCore(svc, userId, data);
}
