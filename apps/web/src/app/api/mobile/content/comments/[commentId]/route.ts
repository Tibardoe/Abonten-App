import { mobileContentPublisher } from "@/app/api/mobile/_lib/actor";
import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import {
  deleteContentCommentCore,
  setContentCommentLikeCore,
} from "@abonten/services/content/contentEngagementCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import {
  contentCommentIdSchema,
  contentCommentLikeSchema,
} from "@abonten/validation/contentSchemas";

// DELETE /api/mobile/content/comments/[commentId] — remove a comment
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  bindLocaleFromRequest(req);
  const { commentId } = await params;
  return discoveryRoute(
    req,
    {
      schema: contentCommentIdSchema,
      label: "DELETE /content/comments/[commentId]",
      params: { commentId },
    },
    async ({ svc, userId, data }) => {
      // A comment on the team's post: the members who post for it.
      const publisher = await mobileContentPublisher(req, signedIn(userId));
      return deleteContentCommentCore(
        svc,
        signedIn(userId),
        data.commentId,
        publisher.blocked ? null : publisher.accountId,
      );
    },
  );
}

// POST /api/mobile/content/comments/[commentId] — like / unlike a comment
export async function POST(
  req: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  bindLocaleFromRequest(req);
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
