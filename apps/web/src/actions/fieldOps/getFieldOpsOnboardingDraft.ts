"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { getOnboardingDraftCore } from "@abonten/services/fieldOps/member/onboardingCore";
import type { FieldOpsOnboardingDraft } from "@abonten/types/fieldOps";
import { fieldOpsOnboardingRefSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * The wizard's resume state for one of the member's onboardings. Same
 * service as GET /api/mobile/field-ops/onboardings/[id].
 */
export async function getFieldOpsOnboardingDraft(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsOnboardingDraft;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsOnboardingRefSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return getOnboardingDraftCore(svc, userId, data);
}
