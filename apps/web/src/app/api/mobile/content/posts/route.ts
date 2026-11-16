import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { createContentPostCore } from "@abonten/services/content/contentPostCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { createContentPostSchema } from "@abonten/validation/contentSchemas";

// POST /api/mobile/content/posts — create a Spotlight or Story
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    { schema: createContentPostSchema, label: "POST /content/posts" },
    async ({ svc, userId, data }) => {
      // Posting as the team named in the header (stage 4c).
      const actor = await mobileActingFor(
        req,
        signedIn(userId),
        "content.post",
      );
      if (actor.error) return actor.error;
      return createContentPostCore(
        svc,
        signedIn(userId),
        data,
        actor.accountId,
      );
    },
  );
}
