import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { markRecommendationOpenedCore } from "@abonten/services/notifications/recommendationsCore";
import { recommendationSubjectSchema } from "@abonten/validation/discoverySchemas";

// POST /api/mobile/recommendations/opened  { subjectType, subjectId }  a For-you card was opened
export async function POST(req: Request) {
  return discoveryRoute(
    req,
    {
      schema: recommendationSubjectSchema,
      label: "POST /recommendations/opened",
    },
    async ({ svc, userId, data }) => {
      await markRecommendationOpenedCore(svc, signedIn(userId), data);
      return { status: 200 };
    },
  );
}
