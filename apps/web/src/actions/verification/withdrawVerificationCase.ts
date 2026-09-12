"use server";

import {
  parseVerificationInput,
  resolveVerificationCaller,
} from "@/utils/verificationAction";
import { withdrawVerificationCaseCore } from "@abonten/services/verification/verificationCaseCore";
import { withdrawVerificationSchema } from "@abonten/validation/verificationSchemas";
import { revalidatePath } from "next/cache";

/** Cancels the caller's own open verification request. */
export async function withdrawVerificationCase(
  input: unknown,
): Promise<{ status: number; message?: string }> {
  const caller = await resolveVerificationCaller();
  if (caller.error) return caller.error;
  const parsed = parseVerificationInput(withdrawVerificationSchema, input);
  if (parsed.error) return parsed.error;

  const res = await withdrawVerificationCaseCore(
    caller.svc,
    caller.userId,
    parsed.data,
  );
  if (res.status === 200) revalidatePath("/manage", "layout");
  return res;
}
