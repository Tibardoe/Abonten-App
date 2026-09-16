import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { searchSpotlightCore } from "@abonten/services/content/contentFeedCore";
import { contentSearchRequestSchema } from "@abonten/validation/contentSchemas";

// GET /api/mobile/content/search — Spotlight search
export async function GET(req: Request) {
  return discoveryRoute(
    req,
    {
      schema: contentSearchRequestSchema,
      label: "GET /content/search",
      allowAnonymous: true,
    },
    ({ svc, userId, data, ip }) => searchSpotlightCore(svc, userId, data.q),
  );
}
