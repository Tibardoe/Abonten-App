"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { getTerritoryViewCore } from "@abonten/services/fieldOps/member/prospectsCore";
import type { FieldOpsTerritoryView } from "@abonten/types/fieldOps";
import { fieldOpsTerritoryLookupSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * A territory with the caller's assignments and prospects there. Same
 * service as GET /api/mobile/field-ops/territories/[id].
 */
export async function getFieldOpsTerritory(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsTerritoryView;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsTerritoryLookupSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return getTerritoryViewCore(svc, userId, data);
}
