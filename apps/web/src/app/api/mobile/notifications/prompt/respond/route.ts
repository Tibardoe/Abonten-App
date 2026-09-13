import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { respondToPromptCore } from "@abonten/services/notifications/promptCore";
import { promptResponseSchema } from "@abonten/validation/discoverySchemas";

// POST /api/mobile/notifications/prompt/respond  { context, response, accept? }
export async function POST(req: Request) {
  return discoveryRoute(
    req,
    {
      schema: promptResponseSchema,
      label: "POST /notifications/prompt/respond",
    },
    ({ svc, userId, data }) => respondToPromptCore(svc, signedIn(userId), data),
  );
}
