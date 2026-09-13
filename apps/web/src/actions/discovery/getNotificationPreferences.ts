"use server";

import { requireDiscoveryUser } from "@/utils/discoveryAction";
import { getNotificationPreferencesCore } from "@abonten/services/notifications/preferencesCore";

/** The signed-in person's optional notification switches. */
export async function getNotificationPreferences() {
  const caller = await requireDiscoveryUser();
  if (caller.error) return caller.error;
  return getNotificationPreferencesCore(caller.svc, caller.userId);
}
