"use server";

import { resolveVerificationCaller } from "@/utils/verificationAction";
import { getVerificationProgramForUser } from "@abonten/services/verification/verificationCaseCore";
import {
  DISABLED_VERIFICATION_PROGRAM,
  type VerificationProgram,
} from "@abonten/types/verificationType";

/**
 * The resolved programme switches for the signed-in user. Ships all-off; a
 * signed-out caller gets the disabled programme rather than a 401, so a
 * public page can call it without special-casing.
 */
export async function getVerificationProgram(): Promise<{
  status: number;
  data: VerificationProgram;
}> {
  const caller = await resolveVerificationCaller();
  if (caller.error) {
    return { status: 200, data: DISABLED_VERIFICATION_PROGRAM };
  }
  const res = await getVerificationProgramForUser(caller.svc, caller.userId);
  return { status: 200, data: res.data ?? DISABLED_VERIFICATION_PROGRAM };
}
