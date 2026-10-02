import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
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
    ({ svc, userId }) => getPromotionOptionsCore(svc, signedIn(userId)),
  );
}
