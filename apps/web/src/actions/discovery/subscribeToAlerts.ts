"use server";

import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { subscribeCore } from "@abonten/services/notifications/subscriptionCore";
import { subscribeSchema } from "@abonten/validation/discoverySchemas";

/** "Notify me" on an organizer or a place. Prompts use respondToRecommendationPrompt. */
export async function subscribeToAlerts(input: unknown) {
  const caller = await requireDiscoveryUser();
  if (caller.error) return caller.error;
  const parsed = parseDiscoveryInput(subscribeSchema, input);
  if (parsed.error) return parsed.error;
  return subscribeCore(
    caller.svc,
    caller.userId,
    parsed.data.target,
    parsed.data.source,
  );
}
