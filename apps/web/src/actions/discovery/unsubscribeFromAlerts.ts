"use server";

import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { unsubscribeCore } from "@abonten/services/notifications/subscriptionCore";
import { unsubscribeSchema } from "@abonten/validation/discoverySchemas";

/** Always allowed, even while the programme is switched off. */
export async function unsubscribeFromAlerts(input: unknown) {
  const caller = await requireDiscoveryUser();
  if (caller.error) return caller.error;
  const parsed = parseDiscoveryInput(unsubscribeSchema, input);
  if (parsed.error) return parsed.error;
  return unsubscribeCore(caller.svc, caller.userId, parsed.data.subscriptionId);
}
