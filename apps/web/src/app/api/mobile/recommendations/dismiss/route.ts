import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { dismissRecommendationCore } from "@abonten/services/notifications/recommendationsCore";
import { recommendationSubjectSchema } from "@abonten/validation/discoverySchemas";

// POST /api/mobile/recommendations/dismiss  { subjectType, subjectId }  "Not interested"
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    {
      schema: recommendationSubjectSchema,
      label: "POST /recommendations/dismiss",
    },
    ({ svc, userId, data }) =>
      dismissRecommendationCore(svc, signedIn(userId), data),
  );
}
