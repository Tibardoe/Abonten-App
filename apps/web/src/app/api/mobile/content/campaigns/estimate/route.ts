import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { estimateContentPromotionCore } from "@abonten/services/content/campaigns/contentPromotionCore";
import { estimateContentPromotionSchema } from "@abonten/validation/contentSchemas";

// POST /api/mobile/content/campaigns/estimate — server-priced estimated reach
export async function POST(req: Request) {
  return discoveryRoute(
    req,
    {
      schema: estimateContentPromotionSchema,
      label: "POST /content/campaigns/estimate",
    },
    ({ svc, userId, data }) =>
      estimateContentPromotionCore(svc, signedIn(userId), data),
  );
}
