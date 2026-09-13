"use server";

import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { dismissRecommendationCore } from "@abonten/services/notifications/recommendationsCore";
import { recommendationSubjectSchema } from "@abonten/validation/discoverySchemas";

/** "Not interested" on a pick. */
export async function dismissRecommendation(input: unknown) {
  const caller = await requireDiscoveryUser();
  if (caller.error) return caller.error;
  const parsed = parseDiscoveryInput(recommendationSubjectSchema, input);
  if (parsed.error) return parsed.error;
  return dismissRecommendationCore(caller.svc, caller.userId, parsed.data);
}
