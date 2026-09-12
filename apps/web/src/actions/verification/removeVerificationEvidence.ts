"use server";

import {
  parseVerificationInput,
  resolveVerificationCaller,
} from "@/utils/verificationAction";
import { removeVerificationEvidenceCore } from "@abonten/services/verification/verificationCaseCore";
import { removeEvidenceSchema } from "@abonten/validation/verificationSchemas";

/** Removes one attached document, and its bytes, from a draft request. */
export async function removeVerificationEvidence(
  input: unknown,
): Promise<{ status: number; message?: string }> {
  const caller = await resolveVerificationCaller();
  if (caller.error) return caller.error;
  const parsed = parseVerificationInput(removeEvidenceSchema, input);
  if (parsed.error) return parsed.error;
  return removeVerificationEvidenceCore(caller.svc, caller.userId, parsed.data);
}
