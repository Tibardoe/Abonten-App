"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { requireDiscoveryUser } from "@/utils/discoveryAction";
import { getTeamsOverviewCore } from "@abonten/services/teams/teamCore";

/** The teams the person runs, the invitations waiting for them, and the switch. */
export const getTeamsOverview = withActionLocale(
  async function getTeamsOverview() {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    return getTeamsOverviewCore(caller.svc, caller.userId);
  },
);
