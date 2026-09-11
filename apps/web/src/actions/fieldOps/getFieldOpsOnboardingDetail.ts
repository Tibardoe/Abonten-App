"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { getOnboardingDetailCore } from "@abonten/services/fieldOps/member/onboardingCore";
import type { FieldOpsOnboardingDetail } from "@abonten/types/fieldOps";
import { fieldOpsOnboardingRefSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * Full detail (evidence, timeline, checklist) for the member who owns it
 * or their team lead. Same service as GET /api/mobile/field-ops/onboardings/[id]/detail.
 */
export async function getFieldOpsOnboardingDetail(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsOnboardingDetail;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsOnboardingRefSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return getOnboardingDetailCore(svc, userId, data);
}
