import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { CONTENT_PROMOTION_CAPABILITIES } from "@abonten/core/teams/roles";
import { getPromotionOptionsCore } from "@abonten/services/content/campaigns/contentPromotionCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { z } from "zod";

// GET /api/mobile/content/campaigns/options — budget range, suggested
// budgets, run lengths and distances for promoting a Spotlight
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    {
      schema: z.object({}).passthrough(),
      label: "GET /content/campaigns/options",
    },
    async ({ svc, userId }) => {
      // Managing as a team: its Owners promote its Spotlights.
      const acting = await mobileActingFor(
        req,
        signedIn(userId),
        CONTENT_PROMOTION_CAPABILITIES,
        { all: true },
      );
      if (acting.error) return acting.error;
      return getPromotionOptionsCore(svc, acting.accountId, signedIn(userId));
    },
  );
}
