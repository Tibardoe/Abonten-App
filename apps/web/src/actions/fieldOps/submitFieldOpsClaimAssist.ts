"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { submitClaimAssistCore } from "@abonten/services/fieldOps/member/claimAssistCore";
import type { FieldOpsOnboarding } from "@abonten/types/fieldOps";
import { fieldOpsClaimAssistSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * File a claim on an existing listing for the owner who verified their
 * phone. Same service as
 * POST /api/mobile/field-ops/onboardings/[id]/claim-assist.
 */
export async function submitFieldOpsClaimAssist(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsOnboarding;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsClaimAssistSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return submitClaimAssistCore(svc, userId, data);
}
