"use server";

import { requireDiscoveryUser } from "@/utils/discoveryAction";
import { listSubscriptionsCore } from "@abonten/services/notifications/subscriptionCore";

/** Organizers, places and topics the person follows. */
export async function listNotificationSubscriptions() {
  const caller = await requireDiscoveryUser();
  if (caller.error) return caller.error;
  return listSubscriptionsCore(caller.svc, caller.userId);
}
