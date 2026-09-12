"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { submitEventOnboardingCore } from "@abonten/services/fieldOps/member/eventOnboardingCore";
import type { FieldOpsOnboarding } from "@abonten/types/fieldOps";
import { fieldOpsEventSubmitSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * Submit an event onboarding: the event is created under the organiser who
 * verified their phone. Same service as
 * POST /api/mobile/field-ops/onboardings/[id]/submit-event.
 */
export async function submitFieldOpsEventOnboarding(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsOnboarding;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsEventSubmitSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return submitEventOnboardingCore(svc, userId, data);
}
