"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { getPayoutDestinationCore } from "@abonten/services/fieldOps/member/payoutDestinationCore";
import type { FieldOpsPayoutDestination } from "@abonten/types/fieldOps";
import { fieldOpsCampaignIdSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * Where the caller's own earnings are sent, masked. Same service as
 * GET /api/mobile/field-ops/payout-destination.
 */
export async function getFieldOpsPayoutDestination(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsPayoutDestination;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsCampaignIdSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return getPayoutDestinationCore(svc, userId, data);
}
