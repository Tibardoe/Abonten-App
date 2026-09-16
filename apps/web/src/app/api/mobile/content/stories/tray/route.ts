import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { getStoryTrayCore } from "@abonten/services/content/storiesCore";
import { z } from "zod";

// GET /api/mobile/content/stories/tray — the Stories row
export async function GET(req: Request) {
  return discoveryRoute(
    req,
    {
      schema: z.object({}).passthrough(),
      label: "GET /content/stories/tray",
      allowAnonymous: true,
    },
    ({ svc, userId, data, ip }) => getStoryTrayCore(svc, userId),
  );
}
