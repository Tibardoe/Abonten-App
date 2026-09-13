"use server";

import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { markPromptShownCore } from "@abonten/services/notifications/promptCore";
import { promptContextSchema } from "@abonten/validation/discoverySchemas";

/** Records that an opt-in card was actually displayed. */
export async function markRecommendationPromptShown(input: unknown) {
  const caller = await requireDiscoveryUser();
  if (caller.error) return caller.error;
  const parsed = parseDiscoveryInput(promptContextSchema, input);
  if (parsed.error) return parsed.error;
  return markPromptShownCore(caller.svc, caller.userId, parsed.data);
}
