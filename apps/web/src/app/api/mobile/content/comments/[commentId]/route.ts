import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import {
  deleteContentCommentCore,
  setContentCommentLikeCore,
} from "@abonten/services/content/contentEngagementCore";
import {
  contentCommentIdSchema,
  contentCommentLikeSchema,
} from "@abonten/validation/contentSchemas";

// DELETE /api/mobile/content/comments/[commentId] — remove a comment
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const { commentId } = await params;
  return discoveryRoute(
    req,
    {
      schema: contentCommentIdSchema,
      label: "DELETE /content/comments/[commentId]",
      params: { commentId },
    },
    ({ svc, userId, data, ip }) =>
      deleteContentCommentCore(svc, signedIn(userId), data.commentId),
  );
}

// POST /api/mobile/content/comments/[commentId] — like / unlike a comment
export async function POST(
  req: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const { commentId } = await params;
  return discoveryRoute(
    req,
    {
      schema: contentCommentLikeSchema,
      label: "POST /content/comments/[commentId]",
      params: { commentId },
    },
    ({ svc, userId, data, ip }) =>
      setContentCommentLikeCore(svc, signedIn(userId), data),
  );
}
