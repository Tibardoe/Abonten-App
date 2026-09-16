import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { getContentInsightsCore } from "@abonten/services/content/contentTelemetryCore";
import { contentInsightsRequestSchema } from "@abonten/validation/contentSchemas";

// GET /api/mobile/content/posts/[postId]/insights — owner analytics
export async function GET(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const { postId } = await params;
  return discoveryRoute(
    req,
    {
      schema: contentInsightsRequestSchema,
      label: "GET /content/posts/[postId]/insights",
      params: { postId },
    },
    ({ svc, userId, data, ip }) =>
      getContentInsightsCore(svc, signedIn(userId), data),
  );
}
