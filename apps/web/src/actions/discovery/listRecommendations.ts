"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { requireDiscoveryUser } from "@/utils/discoveryAction";
import { listRecommendationsCore } from "@abonten/services/notifications/recommendationsCore";

/** The For-you list. */
export const listRecommendations = withActionLocale(
  async function listRecommendations() {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    return listRecommendationsCore(caller.svc, caller.userId);
  },
);
