"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { requireIdentityUser } from "@/utils/identityAction";
import { getIdentityOverviewCore } from "@abonten/services/identity/identityCore";

/** Where the person stands: verified, in progress, in review, or not yet. */
export const getIdentityOverview = withActionLocale(
  async function getIdentityOverview() {
    const caller = await requireIdentityUser();
    if (caller.error) return caller.error;
    return getIdentityOverviewCore(caller.svc, caller.userId);
  },
);
