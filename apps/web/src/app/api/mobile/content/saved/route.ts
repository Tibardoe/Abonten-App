import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { listSavedContentCore } from "@abonten/services/content/contentFeedCore";
import { cursorRequestSchema } from "@abonten/validation/contentSchemas";

// GET /api/mobile/content/saved — saved Spotlights
export async function GET(req: Request) {
  return discoveryRoute(
    req,
    { schema: cursorRequestSchema, label: "GET /content/saved" },
    ({ svc, userId, data, ip }) =>
      listSavedContentCore(svc, signedIn(userId), data.cursor),
  );
}
