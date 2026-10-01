"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseVerificationInput,
  resolveVerificationCaller,
} from "@/utils/verificationAction";
import { getSubjectVerificationCore } from "@abonten/services/verification/verificationCaseCore";
import type { SubjectVerificationView } from "@abonten/types/verificationType";
import { verificationSubjectSchema } from "@abonten/validation/verificationSchemas";

/**
 * Everything a place's or organizer's verification screen needs, in one
 * round trip. Same service as GET /api/mobile/verification/subject.
 */
export const getSubjectVerification = withActionLocale(
  async function getSubjectVerification(input: unknown): Promise<{
    status: number;
    message?: string;
    data?: SubjectVerificationView;
  }> {
    const caller = await resolveVerificationCaller();
    if (caller.error) return caller.error;
    const parsed = parseVerificationInput(verificationSubjectSchema, input);
    if (parsed.error) return parsed.error;
    return getSubjectVerificationCore(caller.svc, caller.userId, parsed.data);
  },
);
