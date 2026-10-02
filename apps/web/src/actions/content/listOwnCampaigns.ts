"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { requireContentUser } from "@/utils/contentAction";
import { listOwnContentCampaignsCore } from "@abonten/services/content/campaigns/contentCampaignCore";

/** The advertiser's own campaigns. */
export const listOwnCampaigns = withActionLocale(
  async function listOwnCampaigns() {
    const caller = await requireContentUser();
    if (caller.error) return caller.error;
    return listOwnContentCampaignsCore(caller.svc, caller.userId);
  },
);
