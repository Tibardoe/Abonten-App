"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { respondToPromptCore } from "@abonten/services/notifications/promptCore";
import { promptResponseSchema } from "@abonten/validation/discoverySchemas";

/** "Turn on notifications" or "Not now" on an opt-in card. */
export const respondToRecommendationPrompt = withActionLocale(
  async function respondToRecommendationPrompt(input: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const parsed = parseDiscoveryInput(promptResponseSchema, input);
    if (parsed.error) return parsed.error;
    return respondToPromptCore(caller.svc, caller.userId, parsed.data);
  },
);
