"use server";

import { requireContentUser } from "@/utils/contentAction";
import { listOwnContentCampaignsCore } from "@abonten/services/content/campaigns/contentCampaignCore";

/** The advertiser's own campaigns. */
export async function listOwnCampaigns() {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  return listOwnContentCampaignsCore(caller.svc, caller.userId);
}
