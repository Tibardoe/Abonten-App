"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { getMyEarningsCore } from "@abonten/services/fieldOps/member/earningsQuery";
import type { FieldOpsMyEarnings } from "@abonten/types/fieldOps";
import { fieldOpsEarningsSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * The member's own commission lines and money totals. Same service as
 * GET /api/mobile/field-ops/earnings.
 */
export async function getMyFieldOpsEarnings(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsMyEarnings | null;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsEarningsSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return getMyEarningsCore(svc, userId, data);
}
