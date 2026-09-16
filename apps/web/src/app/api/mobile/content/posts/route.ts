import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { createContentPostCore } from "@abonten/services/content/contentPostCore";
import { createContentPostSchema } from "@abonten/validation/contentSchemas";

// POST /api/mobile/content/posts — create a Spotlight or Story
export async function POST(req: Request) {
  return discoveryRoute(
    req,
    { schema: createContentPostSchema, label: "POST /content/posts" },
    ({ svc, userId, data, ip }) =>
      createContentPostCore(svc, signedIn(userId), data),
  );
}
