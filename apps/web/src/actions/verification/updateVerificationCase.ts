"use server";

import {
  parseVerificationInput,
  resolveVerificationCaller,
} from "@/utils/verificationAction";
import { updateVerificationCaseCore } from "@abonten/services/verification/verificationCaseCore";
import { updateVerificationCaseSchema } from "@abonten/validation/verificationSchemas";

/** Edits the business name, note and contact details on a draft request. */
export async function updateVerificationCase(
  input: unknown,
): Promise<{ status: number; message?: string }> {
  const caller = await resolveVerificationCaller();
  if (caller.error) return caller.error;
  const parsed = parseVerificationInput(updateVerificationCaseSchema, input);
  if (parsed.error) return parsed.error;
  return updateVerificationCaseCore(caller.svc, caller.userId, parsed.data);
}
