"use server";

import {
  parseVerificationInput,
  resolveVerificationCaller,
} from "@/utils/verificationAction";
import { requestVerificationEvidenceUploadCore } from "@abonten/services/verification/verificationCaseCore";
import type { VerificationUploadTicket } from "@abonten/types/verificationType";
import { evidenceUploadRequestSchema } from "@abonten/validation/verificationSchemas";

/**
 * A one-shot signed upload ticket for the private verification-evidence
 * bucket. That bucket has no storage policies on purpose: the ticket IS the
 * authorization, and it is minted only after the service confirmed the
 * caller owns this case and may still edit it.
 */
export async function requestVerificationEvidenceUpload(
  input: unknown,
): Promise<{
  status: number;
  message?: string;
  data?: VerificationUploadTicket;
}> {
  const caller = await resolveVerificationCaller();
  if (caller.error) return caller.error;
  const parsed = parseVerificationInput(evidenceUploadRequestSchema, input);
  if (parsed.error) return parsed.error;
  return requestVerificationEvidenceUploadCore(
    caller.svc,
    caller.userId,
    parsed.data,
  );
}
