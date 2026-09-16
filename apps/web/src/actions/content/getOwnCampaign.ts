"use server";

import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import {
  getContentCampaignCore,
  getContentCampaignHistoryCore,
} from "@abonten/services/content/campaigns/contentCampaignCore";
import { contentCampaignIdSchema } from "@abonten/validation/contentSchemas";

/** One of the advertiser's campaigns with its history. */
export async function getOwnCampaign(input: unknown) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(contentCampaignIdSchema, input);
  if (parsed.error) return parsed.error;
  const campaign = await getContentCampaignCore(
    caller.svc,
    caller.userId,
    parsed.data.campaignId,
  );
  if (campaign.status !== 200 || !campaign.data) return campaign;
  const history = await getContentCampaignHistoryCore(
    caller.svc,
    parsed.data.campaignId,
  );
  return {
    status: 200 as const,
    data: { campaign: campaign.data, ...history },
  };
}
