"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { requestOwnerOtpCore } from "@abonten/services/fieldOps/member/ownerOtpCore";
import { fieldOpsOwnerOtpRequestSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * Sends the consent code to the business owner's phone. Same service as
 * POST /api/mobile/field-ops/onboardings/[id]/owner-otp.
 */
export async function requestFieldOpsOwnerOtp(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: {
    ownerPhoneMasked: string;
    resendInSeconds: number;
    consentPath: string | null;
  };
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsOwnerOtpRequestSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return requestOwnerOtpCore(svc, userId, data);
}
