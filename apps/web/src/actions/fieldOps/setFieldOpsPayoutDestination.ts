"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { setPayoutDestinationCore } from "@abonten/services/fieldOps/member/payoutDestinationCore";
import type { FieldOpsPayoutDestination } from "@abonten/types/fieldOps";
import { fieldOpsPayoutDestinationSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * The member sets their own mobile-money destination. Same service as
 * PUT /api/mobile/field-ops/payout-destination.
 */
export async function setFieldOpsPayoutDestination(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsPayoutDestination;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsPayoutDestinationSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return setPayoutDestinationCore(svc, userId, data);
}
