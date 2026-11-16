import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { listOwnContentPostsCore } from "@abonten/services/content/contentPostCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { ownContentRequestSchema } from "@abonten/validation/contentSchemas";

// GET /api/mobile/content/mine — own posts in every state
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  return discoveryRoute(
    req,
    { schema: ownContentRequestSchema, label: "GET /content/mine" },
    async ({ svc, userId, data }) => {
      // The person's own posts when asked for them (their own profile);
      // otherwise the team's while managing as it (stage 4c).
      if (data.personal) {
        return listOwnContentPostsCore(svc, signedIn(userId), data);
      }
      const actor = await mobileActingFor(
        req,
        signedIn(userId),
        "content.post",
      );
      if (actor.error) return actor.error;
      return listOwnContentPostsCore(svc, actor.accountId, data);
    },
  );
}
