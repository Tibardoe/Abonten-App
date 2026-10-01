"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { listTeamContentCore } from "@abonten/services/fieldOps/lead/contentLeadCore";
import type {
  FieldOpsContentBrief,
  FieldOpsContentSubmission,
} from "@abonten/types/fieldOps";
import { fieldOpsCampaignIdSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * The lead's view of the team's briefs and deliverables. Same service as
 * GET /api/mobile/field-ops/lead/content.
 */
export const listFieldOpsTeamContent = withActionLocale(
  async function listFieldOpsTeamContent(input: unknown): Promise<{
    status: number;
    message?: string;
    data?: {
      briefs: FieldOpsContentBrief[];
      submissions: FieldOpsContentSubmission[];
    };
  }> {
    const caller = await resolveFieldOpsCaller();
    if (caller.error) return caller.error;
    const { userId, svc } = caller;
    const parsed = parseFieldOpsInput(fieldOpsCampaignIdSchema, input);
    if (parsed.error) return parsed.error;
    const { data } = parsed;
    return listTeamContentCore(svc, userId, data);
  },
);
