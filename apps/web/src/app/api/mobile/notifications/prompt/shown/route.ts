import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { markPromptShownCore } from "@abonten/services/notifications/promptCore";
import { promptContextSchema } from "@abonten/validation/discoverySchemas";

// POST /api/mobile/notifications/prompt/shown  (same body as the prompt query)
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    { schema: promptContextSchema, label: "POST /notifications/prompt/shown" },
    ({ svc, userId, data }) => markPromptShownCore(svc, signedIn(userId), data),
  );
}
