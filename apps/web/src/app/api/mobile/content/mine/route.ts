import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { listOwnContentPostsCore } from "@abonten/services/content/contentPostCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { ownContentRequestSchema } from "@abonten/validation/contentSchemas";

// GET /api/mobile/content/mine — own posts in every state
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    { schema: ownContentRequestSchema, label: "GET /content/mine" },
    ({ svc, userId, data, ip }) =>
      listOwnContentPostsCore(svc, signedIn(userId), data),
  );
}
