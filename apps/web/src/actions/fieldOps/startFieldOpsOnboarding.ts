"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { startOnboardingCore } from "@abonten/services/fieldOps/member/onboardingCore";
import type { FieldOpsOnboarding } from "@abonten/types/fieldOps";
import { fieldOpsOnboardingStartSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * Opens (or resumes) a draft onboarding in an assigned territory. Same
 * service as POST /api/mobile/field-ops/onboardings.
 */
export async function startFieldOpsOnboarding(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsOnboarding;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsOnboardingStartSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return startOnboardingCore(svc, userId, data);
}
