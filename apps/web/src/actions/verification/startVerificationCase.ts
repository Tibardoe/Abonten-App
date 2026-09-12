"use server";

import {
  parseVerificationInput,
  resolveVerificationCaller,
} from "@/utils/verificationAction";
import { startVerificationCaseCore } from "@abonten/services/verification/verificationCaseCore";
import { startVerificationSchema } from "@abonten/validation/verificationSchemas";
import { revalidatePath } from "next/cache";

/**
 * Opens a draft verification request. The service checks the programme
 * switches, that the caller owns the subject, and the rate limit.
 */
export async function startVerificationCase(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: { caseId: string };
}> {
  const caller = await resolveVerificationCaller();
  if (caller.error) return caller.error;
  const parsed = parseVerificationInput(startVerificationSchema, input);
  if (parsed.error) return parsed.error;

  const res = await startVerificationCaseCore(
    caller.svc,
    caller.userId,
    parsed.data,
  );
  if (res.status === 200) {
    revalidatePath(
      parsed.data.subjectType === "place"
        ? `/manage/places/${parsed.data.subjectId}`
        : "/manage/verification",
    );
  }
  return res;
}
