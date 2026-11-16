"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { parseContentInput, requireContentUser } from "@/utils/contentAction";
import { actingFor } from "@/utils/teamActor";
import { CONTENT_PROMOTION_CAPABILITIES } from "@abonten/core/teams/roles";
import { estimateContentPromotionCore } from "@abonten/services/content/campaigns/contentPromotionCore";
import { estimateContentPromotionSchema } from "@abonten/validation/contentSchemas";

/** Server-priced estimated reach for a budget, run length and audience. */
export const estimateContentPromotion = withActionLocale(
  async function estimateContentPromotion(input: unknown) {
    const caller = await requireContentUser();
    if (caller.error) return caller.error;
    const parsed = parseContentInput(estimateContentPromotionSchema, input);
    if (parsed.error) return parsed.error;
    // Managing as a team: its Owners promote its Spotlights; they pay.
    const acting = await actingFor(
      caller.userId,
      CONTENT_PROMOTION_CAPABILITIES,
      { all: true },
    );
    if (acting.error) return acting.error;
    return estimateContentPromotionCore(
      caller.svc,
      acting.accountId,
      parsed.data,
      caller.userId,
    );
  },
);
