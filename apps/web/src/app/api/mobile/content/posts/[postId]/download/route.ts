import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { getContentDownloadUrlCore } from "@abonten/services/content/contentPostCore";
import { contentPostIdSchema } from "@abonten/validation/contentSchemas";

// GET /api/mobile/content/posts/[postId]/download — download link when allowed
export async function GET(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const { postId } = await params;
  return discoveryRoute(
    req,
    {
      schema: contentPostIdSchema,
      label: "GET /content/posts/[postId]/download",
      allowAnonymous: true,
      params: { postId },
    },
    ({ svc, userId, data, ip }) =>
      getContentDownloadUrlCore(svc, userId, data.postId),
  );
}
