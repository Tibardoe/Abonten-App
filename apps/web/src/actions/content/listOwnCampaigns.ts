"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { requireContentUser } from "@/utils/contentAction";
import { actingFor } from "@/utils/teamActor";
import { CONTENT_PROMOTION_CAPABILITIES } from "@abonten/core/teams/roles";
import { listOwnContentCampaignsCore } from "@abonten/services/content/campaigns/contentCampaignCore";

/** The advertiser's own campaigns. */
export const listOwnCampaigns = withActionLocale(
  async function listOwnCampaigns() {
    const caller = await requireContentUser();
    if (caller.error) return caller.error;
    // Managing as a team: its Owners promote its Spotlights; they pay.
    const acting = await actingFor(
      caller.userId,
      CONTENT_PROMOTION_CAPABILITIES,
      { all: true },
    );
    if (acting.error) return acting.error;
    return listOwnContentCampaignsCore(caller.svc, acting.accountId);
  },
);
