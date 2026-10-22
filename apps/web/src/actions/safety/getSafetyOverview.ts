"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { requireSafetyUser } from "@/utils/safetyAction";
import { getSafetyOverviewCore } from "@abonten/services/safety/safetySessionCore";

/** Everything the Safety page shows: contacts, the open session, history. */
export const getSafetyOverview = withActionLocale(
  async function getSafetyOverview() {
    const caller = await requireSafetyUser();
    if (caller.error) return caller.error;
    return getSafetyOverviewCore(caller.svc, caller.userId);
  },
);
