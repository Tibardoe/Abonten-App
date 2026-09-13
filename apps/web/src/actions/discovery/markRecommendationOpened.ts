"use server";

import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { markRecommendationOpenedCore } from "@abonten/services/notifications/recommendationsCore";
import { recommendationSubjectSchema } from "@abonten/validation/discoverySchemas";

/** A For-you card was opened. */
export async function markRecommendationOpened(input: unknown) {
  const caller = await requireDiscoveryUser();
  if (caller.error) return caller.error;
  const parsed = parseDiscoveryInput(recommendationSubjectSchema, input);
  if (parsed.error) return parsed.error;
  await markRecommendationOpenedCore(caller.svc, caller.userId, parsed.data);
  return { status: 200 as const };
}
