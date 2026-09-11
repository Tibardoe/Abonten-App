"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { withdrawOnboardingCore } from "@abonten/services/fieldOps/member/onboardingCore";
import type { FieldOpsOnboarding } from "@abonten/types/fieldOps";
import { fieldOpsOnboardingWithdrawSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * Withdraws a draft or submitted onboarding. Same service as
 * POST /api/mobile/field-ops/onboardings/[id]/withdraw.
 */
export async function withdrawFieldOpsOnboarding(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsOnboarding;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsOnboardingWithdrawSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return withdrawOnboardingCore(svc, userId, data);
}
