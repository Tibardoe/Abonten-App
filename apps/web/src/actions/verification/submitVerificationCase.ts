"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import {
  parseVerificationInput,
  resolveVerificationCaller,
} from "@/utils/verificationAction";
import { submitVerificationCaseCore } from "@abonten/services/verification/verificationCaseCore";
import { submitVerificationSchema } from "@abonten/validation/verificationSchemas";

/**
 * Sends a draft, or a case sent back for more information, to review. The
 * service confirms every uploaded object actually landed before the state
 * moves, so "submitted" always means real evidence exists.
 */
export const submitVerificationCase = withActionLocale(
  async function submitVerificationCase(
    input: unknown,
  ): Promise<{ status: number; message?: string }> {
    const caller = await resolveVerificationCaller();
    if (caller.error) return caller.error;
    const parsed = parseVerificationInput(submitVerificationSchema, input);
    if (parsed.error) return parsed.error;

    const res = await submitVerificationCaseCore(
      caller.svc,
      caller.userId,
      parsed.data,
    );
    if (res.status === 200) revalidateAppPath("/manage", "layout");
    return res;
  },
);
