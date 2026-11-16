import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { publishContentPostCore } from "@abonten/services/content/contentPostCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { contentPostIdSchema } from "@abonten/validation/contentSchemas";

// POST /api/mobile/content/posts/[postId]/publish — publish an own draft
export async function POST(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  bindLocaleFromRequest(req);
  const { postId } = await params;
  return discoveryRoute(
    req,
    {
      schema: contentPostIdSchema,
      label: "POST /content/posts/[postId]/publish",
      params: { postId },
    },
    async ({ svc, userId, data }) => {
      const actor = await mobileActingFor(
        req,
        signedIn(userId),
        "content.post",
      );
      if (actor.error) return actor.error;
      return publishContentPostCore(
        svc,
        actor.accountId,
        data.postId,
        signedIn(userId),
      );
    },
  );
}
