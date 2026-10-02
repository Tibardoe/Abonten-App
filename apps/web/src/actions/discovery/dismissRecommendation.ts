"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { dismissRecommendationCore } from "@abonten/services/notifications/recommendationsCore";
import { recommendationSubjectSchema } from "@abonten/validation/discoverySchemas";

/** "Not interested" on a pick. */
export const dismissRecommendation = withActionLocale(
  async function dismissRecommendation(input: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const parsed = parseDiscoveryInput(recommendationSubjectSchema, input);
    if (parsed.error) return parsed.error;
    return dismissRecommendationCore(caller.svc, caller.userId, parsed.data);
  },
);
