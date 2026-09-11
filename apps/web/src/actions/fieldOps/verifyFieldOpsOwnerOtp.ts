"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { verifyOwnerOtpCore } from "@abonten/services/fieldOps/member/ownerOtpCore";
import type { FieldOpsOnboarding } from "@abonten/types/fieldOps";
import { fieldOpsOwnerOtpVerifySchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * Confirms the owner's code and records them as the owner. Same service
 * as POST /api/mobile/field-ops/onboardings/[id]/owner-otp/verify.
 */
export async function verifyFieldOpsOwnerOtp(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsOnboarding;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsOwnerOtpVerifySchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return verifyOwnerOtpCore(svc, userId, data);
}
