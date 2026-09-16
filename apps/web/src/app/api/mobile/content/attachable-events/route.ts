import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { listAttachableEventsCore } from "@abonten/services/content/contentAttachCore";
import { z } from "zod";

// GET /api/mobile/content/attachable-events — events the caller may attach
// to a Spotlight or Story (same service as the web listAttachableEvents).
export async function GET(req: Request) {
  return discoveryRoute(
    req,
    {
      schema: z.object({}).passthrough(),
      label: "GET /content/attachable-events",
    },
    ({ svc, userId }) => listAttachableEventsCore(svc, signedIn(userId)),
  );
}
