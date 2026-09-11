"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { reviewOnboardingCore } from "@abonten/services/fieldOps/lead/reviewCore";
import type { FieldOpsOnboarding } from "@abonten/types/fieldOps";
import { fieldOpsReviewSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * The team lead's decision on a submitted onboarding. Same service as
 * POST /api/mobile/field-ops/lead/review/[id].
 */
export async function reviewFieldOpsOnboarding(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsOnboarding;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsReviewSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return reviewOnboardingCore(svc, userId, data);
}
