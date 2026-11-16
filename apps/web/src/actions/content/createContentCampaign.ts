"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { actingFor } from "@/utils/teamActor";
import { CONTENT_PROMOTION_CAPABILITIES } from "@abonten/core/teams/roles";
import { createContentCampaignCore } from "@abonten/services/content/campaigns/contentCampaignCore";
import { createContentCampaignSchema } from "@abonten/validation/contentSchemas";

/** Starts a promoted Spotlight campaign and its checkout. */
export const createContentCampaign = withActionLocale(
  async function createContentCampaign(input: unknown) {
    const caller = await requireContentUser();
    if (caller.error) return caller.error;
    const parsed = parseContentInput(createContentCampaignSchema, input);
    if (parsed.error) return parsed.error;
    // Managing as a team: its Owners promote its Spotlights; they pay.
    const acting = await actingFor(
      caller.userId,
      CONTENT_PROMOTION_CAPABILITIES,
      { all: true },
    );
    if (acting.error) return acting.error;
    return createContentCampaignCore(
      caller.svc,
      acting.accountId,
      parsed.data,
      caller.userId,
    );
  },
);
