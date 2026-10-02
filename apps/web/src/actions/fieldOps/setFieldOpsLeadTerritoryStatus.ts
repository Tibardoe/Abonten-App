"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { setLeadTerritoryStatusCore } from "@abonten/services/fieldOps/lead/leadTerritoriesCore";
import type { FieldOpsTerritory } from "@abonten/types/fieldOps";
import { fieldOpsLeadTerritoryStatusSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * A team lead marks a territory completed or reopens it. Same service as
 * PATCH /api/mobile/field-ops/lead/territories/[id].
 */
export const setFieldOpsLeadTerritoryStatus = withActionLocale(
  async function setFieldOpsLeadTerritoryStatus(input: unknown): Promise<{
    status: number;
    message?: string;
    data?: FieldOpsTerritory;
  }> {
    const caller = await resolveFieldOpsCaller();
    if (caller.error) return caller.error;
    const { userId, svc } = caller;
    const parsed = parseFieldOpsInput(fieldOpsLeadTerritoryStatusSchema, input);
    if (parsed.error) return parsed.error;
    const { data } = parsed;
    return setLeadTerritoryStatusCore(svc, userId, data);
  },
);
