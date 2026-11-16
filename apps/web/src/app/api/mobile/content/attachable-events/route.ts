import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { listAttachableEventsCore } from "@abonten/services/content/contentAttachCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { z } from "zod";

// GET /api/mobile/content/attachable-events — events the caller may attach
// to a Spotlight or Story (same service as the web listAttachableEvents).
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    {
      schema: z.object({}).passthrough(),
      label: "GET /content/attachable-events",
    },
    async ({ svc, userId }) => {
      const actor = await mobileActingFor(
        req,
        signedIn(userId),
        "content.post",
      );
      if (actor.error) return actor.error;
      return listAttachableEventsCore(svc, actor.accountId);
    },
  );
}
