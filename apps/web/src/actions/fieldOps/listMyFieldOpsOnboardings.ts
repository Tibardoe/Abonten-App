"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { listMyOnboardingsCore } from "@abonten/services/fieldOps/member/onboardingCore";
import type { FieldOpsOnboarding } from "@abonten/types/fieldOps";
import { fieldOpsOnboardingListSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * The member's own onboardings. Same service as
 * GET /api/mobile/field-ops/onboardings.
 */
export async function listMyFieldOpsOnboardings(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsOnboarding[];
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsOnboardingListSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return listMyOnboardingsCore(svc, userId, data);
}
