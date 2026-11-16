"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { requireContentUser } from "@/utils/contentAction";
import { actingFor } from "@/utils/teamActor";
import { CONTENT_PROMOTION_CAPABILITIES } from "@abonten/core/teams/roles";
import { getPromotionOptionsCore } from "@abonten/services/content/campaigns/contentPromotionCore";

/** Budget range, suggested budgets and run lengths for a promotion. */
export const getPromotionOptions = withActionLocale(
  async function getPromotionOptions() {
    const caller = await requireContentUser();
    if (caller.error) return caller.error;
    // Managing as a team: its Owners promote its Spotlights; they pay.
    const acting = await actingFor(
      caller.userId,
      CONTENT_PROMOTION_CAPABILITIES,
      { all: true },
    );
    if (acting.error) return acting.error;
    return getPromotionOptionsCore(caller.svc, acting.accountId, caller.userId);
  },
);
