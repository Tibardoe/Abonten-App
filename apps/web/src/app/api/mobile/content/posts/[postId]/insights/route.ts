import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { getContentInsightsCore } from "@abonten/services/content/contentTelemetryCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { contentInsightsRequestSchema } from "@abonten/validation/contentSchemas";

// GET /api/mobile/content/posts/[postId]/insights — owner analytics
export async function GET(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  bindLocaleFromRequest(req);
  const { postId } = await params;
  return discoveryRoute(
    req,
    {
      schema: contentInsightsRequestSchema,
      label: "GET /content/posts/[postId]/insights",
      params: { postId },
    },
    async ({ svc, userId, data }) => {
      const actor = await mobileActingFor(
        req,
        signedIn(userId),
        "content.post",
      );
      if (actor.error) return actor.error;
      return getContentInsightsCore(svc, actor.accountId, data);
    },
  );
}
