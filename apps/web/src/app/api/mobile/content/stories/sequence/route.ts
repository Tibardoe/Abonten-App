import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { getStorySequenceCore } from "@abonten/services/content/storiesCore";
import { storySequenceRequestSchema } from "@abonten/validation/contentSchemas";

// GET /api/mobile/content/stories/sequence — one publisher's active Stories
export async function GET(req: Request) {
  return discoveryRoute(
    req,
    {
      schema: storySequenceRequestSchema,
      label: "GET /content/stories/sequence",
      allowAnonymous: true,
    },
    ({ svc, userId, data, ip }) => getStorySequenceCore(svc, userId, data),
  );
}
