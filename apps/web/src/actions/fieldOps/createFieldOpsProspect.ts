"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { createProspectCore } from "@abonten/services/fieldOps/member/prospectsCore";
import type { FieldOpsProspect } from "@abonten/types/fieldOps";
import { fieldOpsProspectCreateSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * Logs a business/organizer the member found in their assigned territory.
 * Same service as POST /api/mobile/field-ops/prospects.
 */
export const createFieldOpsProspect = withActionLocale(
  async function createFieldOpsProspect(input: unknown): Promise<{
    status: number;
    message?: string;
    data?: FieldOpsProspect;
  }> {
    const caller = await resolveFieldOpsCaller();
    if (caller.error) return caller.error;
    const { userId, svc } = caller;
    const parsed = parseFieldOpsInput(fieldOpsProspectCreateSchema, input);
    if (parsed.error) return parsed.error;
    const { data } = parsed;
    return createProspectCore(svc, userId, data);
  },
);
