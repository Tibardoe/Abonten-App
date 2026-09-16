import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { getContentFeedCore } from "@abonten/services/content/contentFeedCore";
import { contentFeedRequestSchema } from "@abonten/validation/contentSchemas";

// GET /api/mobile/content/feed — one page of a Spotlight surface
export async function GET(req: Request) {
  return discoveryRoute(
    req,
    {
      schema: contentFeedRequestSchema,
      label: "GET /content/feed",
      allowAnonymous: true,
    },
    ({ svc, userId, data, ip }) =>
      getContentFeedCore(svc, userId, data, { ip }),
  );
}
