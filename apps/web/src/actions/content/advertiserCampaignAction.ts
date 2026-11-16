"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { actingFor } from "@/utils/teamActor";
import { CONTENT_PROMOTION_CAPABILITIES } from "@abonten/core/teams/roles";
import { advertiserCampaignActionCore } from "@abonten/services/content/campaigns/contentCampaignCore";
import { advertiserCampaignActionSchema } from "@abonten/validation/contentSchemas";

/** Pause, resume or cancel an own campaign. */
export const advertiserCampaignAction = withActionLocale(
  async function advertiserCampaignAction(input: unknown) {
    const caller = await requireContentUser();
    if (caller.error) return caller.error;
    const parsed = parseContentInput(advertiserCampaignActionSchema, input);
    if (parsed.error) return parsed.error;
    // Managing as a team: its Owners promote its Spotlights; they pay.
    const acting = await actingFor(
      caller.userId,
      CONTENT_PROMOTION_CAPABILITIES,
      { all: true },
    );
    if (acting.error) return acting.error;
    return advertiserCampaignActionCore(
      caller.svc,
      acting.accountId,
      parsed.data,
      caller.userId,
    );
  },
);
