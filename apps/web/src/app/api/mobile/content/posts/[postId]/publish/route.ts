import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { publishContentPostCore } from "@abonten/services/content/contentPostCore";
import { contentPostIdSchema } from "@abonten/validation/contentSchemas";

// POST /api/mobile/content/posts/[postId]/publish — publish an own draft
export async function POST(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const { postId } = await params;
  return discoveryRoute(
    req,
    {
      schema: contentPostIdSchema,
      label: "POST /content/posts/[postId]/publish",
      params: { postId },
    },
    ({ svc, userId, data, ip }) =>
      publishContentPostCore(svc, signedIn(userId), data.postId),
  );
}
