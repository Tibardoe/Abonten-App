"use server";

import {
  parseDiscoveryInput,
  resolveDiscoveryCaller,
} from "@/utils/discoveryAction";
import { getPromptOfferCore } from "@abonten/services/notifications/promptCore";
import { EMPTY_PROMPT_OFFER } from "@abonten/types/discoveryType";
import { promptContextSchema } from "@abonten/validation/discoverySchemas";

/** What an opt-in card may offer after a purchase, RSVP or place interaction. */
export async function getRecommendationPrompt(input: unknown) {
  const parsed = parseDiscoveryInput(promptContextSchema, input);
  if (parsed.error) return { status: 200 as const, data: EMPTY_PROMPT_OFFER };
  const caller = await resolveDiscoveryCaller();
  if (!caller.userId) return { status: 200 as const, data: EMPTY_PROMPT_OFFER };
  return getPromptOfferCore(caller.svc, caller.userId, parsed.data);
}
