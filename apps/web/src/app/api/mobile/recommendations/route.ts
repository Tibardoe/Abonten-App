import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { listRecommendationsCore } from "@abonten/services/notifications/recommendationsCore";
import { z } from "zod";

// GET /api/mobile/recommendations   the For-you list
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    { schema: z.object({}).passthrough(), label: "GET /recommendations" },
    ({ svc, userId }) => listRecommendationsCore(svc, signedIn(userId)),
  );
}
