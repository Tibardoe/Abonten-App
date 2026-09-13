import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { dismissRecommendationCore } from "@abonten/services/notifications/recommendationsCore";
import { recommendationSubjectSchema } from "@abonten/validation/discoverySchemas";

// POST /api/mobile/recommendations/dismiss  { subjectType, subjectId }  "Not interested"
export async function POST(req: Request) {
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
