import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { CONTENT_PROMOTION_CAPABILITIES } from "@abonten/core/teams/roles";
import { estimateContentPromotionCore } from "@abonten/services/content/campaigns/contentPromotionCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { estimateContentPromotionSchema } from "@abonten/validation/contentSchemas";

// POST /api/mobile/content/campaigns/estimate — server-priced estimated reach
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    {
      schema: estimateContentPromotionSchema,
      label: "POST /content/campaigns/estimate",
    },
    async ({ svc, userId, data }) => {
      // Managing as a team: its Owners promote its Spotlights.
      const acting = await mobileActingFor(
        req,
        signedIn(userId),
        CONTENT_PROMOTION_CAPABILITIES,
        { all: true },
      );
      if (acting.error) return acting.error;
      return estimateContentPromotionCore(
        svc,
        acting.accountId,
        data,
        signedIn(userId),
      );
    },
  );
}
