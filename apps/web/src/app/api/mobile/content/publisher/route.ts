import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { listPublisherPostsCore } from "@abonten/services/content/contentPostCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { publisherPostsRequestSchema } from "@abonten/validation/contentSchemas";

// GET /api/mobile/content/publisher — public posts of one organizer or place
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    {
      schema: publisherPostsRequestSchema,
      label: "GET /content/publisher",
      allowAnonymous: true,
    },
    ({ svc, userId, data, ip }) => listPublisherPostsCore(svc, userId, data),
  );
}
