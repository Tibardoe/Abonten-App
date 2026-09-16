import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import {
  createContentCommentCore,
  listContentCommentsCore,
} from "@abonten/services/content/contentEngagementCore";
import {
  contentCommentsRequestSchema,
  createContentCommentSchema,
} from "@abonten/validation/contentSchemas";

// GET /api/mobile/content/posts/[postId]/comments — comments or replies
export async function GET(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const { postId } = await params;
  return discoveryRoute(
    req,
    {
      schema: contentCommentsRequestSchema,
      label: "GET /content/posts/[postId]/comments",
      allowAnonymous: true,
      params: { postId },
    },
    ({ svc, userId, data, ip }) => listContentCommentsCore(svc, userId, data),
  );
}

// POST /api/mobile/content/posts/[postId]/comments — add a comment or reply
export async function POST(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const { postId } = await params;
  return discoveryRoute(
    req,
    {
      schema: createContentCommentSchema,
      label: "POST /content/posts/[postId]/comments",
      params: { postId },
    },
    ({ svc, userId, data, ip }) =>
      createContentCommentCore(svc, signedIn(userId), data),
  );
}
