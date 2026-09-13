import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { markPromptShownCore } from "@abonten/services/notifications/promptCore";
import { promptContextSchema } from "@abonten/validation/discoverySchemas";

// POST /api/mobile/notifications/prompt/shown  (same body as the prompt query)
export async function POST(req: Request) {
  return discoveryRoute(
    req,
    { schema: promptContextSchema, label: "POST /notifications/prompt/shown" },
    ({ svc, userId, data }) => markPromptShownCore(svc, signedIn(userId), data),
  );
}
