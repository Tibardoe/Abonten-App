"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { listReviewQueueCore } from "@abonten/services/fieldOps/lead/reviewCore";
import type { FieldOpsOnboarding } from "@abonten/types/fieldOps";
import { fieldOpsOnboardingListSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * The team lead's review queue. Same service as
 * GET /api/mobile/field-ops/lead/review.
 */
export const listFieldOpsReviewQueue = withActionLocale(
  async function listFieldOpsReviewQueue(input: unknown): Promise<{
    status: number;
    message?: string;
    data?: FieldOpsOnboarding[];
  }> {
    const caller = await resolveFieldOpsCaller();
    if (caller.error) return caller.error;
    const { userId, svc } = caller;
    const parsed = parseFieldOpsInput(fieldOpsOnboardingListSchema, input);
    if (parsed.error) return parsed.error;
    const { data } = parsed;
    return listReviewQueueCore(svc, userId, data);
  },
);
