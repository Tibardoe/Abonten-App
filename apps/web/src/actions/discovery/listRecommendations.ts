"use server";

import { requireDiscoveryUser } from "@/utils/discoveryAction";
import { listRecommendationsCore } from "@abonten/services/notifications/recommendationsCore";

/** The For-you list. */
export async function listRecommendations() {
  const caller = await requireDiscoveryUser();
  if (caller.error) return caller.error;
  return listRecommendationsCore(caller.svc, caller.userId);
}
