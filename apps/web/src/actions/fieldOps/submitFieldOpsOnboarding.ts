"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { submitOnboardingCore } from "@abonten/services/fieldOps/member/onboardingCore";
import type { FieldOpsOnboarding } from "@abonten/types/fieldOps";
import { fieldOpsOnboardingSubmitSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * Creates the place under the verified owner and sends the onboarding to
 * the team lead. Same service as POST /api/mobile/field-ops/onboardings/[id]/submit.
 */
export async function submitFieldOpsOnboarding(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsOnboarding;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsOnboardingSubmitSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return submitOnboardingCore(svc, userId, data);
}
