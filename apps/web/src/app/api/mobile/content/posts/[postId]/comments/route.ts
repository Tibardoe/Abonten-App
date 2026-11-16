import { mobileContentPublisher } from "@/app/api/mobile/_lib/actor";
import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import {
  createContentCommentCore,
  listContentCommentsCore,
} from "@abonten/services/content/contentEngagementCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import {
  contentCommentsRequestSchema,
  createContentCommentSchema,
} from "@abonten/validation/contentSchemas";

// GET /api/mobile/content/posts/[postId]/comments — comments or replies
export async function GET(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  bindLocaleFromRequest(req);
  const { postId } = await params;
  return discoveryRoute(
    req,
    {
      schema: contentCommentsRequestSchema,
      label: "GET /content/posts/[postId]/comments",
      allowAnonymous: true,
      params: { postId },
    },
    async ({ svc, userId, data }) => {
      // Comments on the team's post: the members who post for it may
      // remove them (stage 4c).
      const publisher = userId
        ? await mobileContentPublisher(req, userId)
        : null;
      return listContentCommentsCore(
        svc,
        userId,
        data,
        publisher && !publisher.blocked ? publisher.accountId : null,
      );
    },
  );
}

// POST /api/mobile/content/posts/[postId]/comments — add a comment or reply
export async function POST(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  bindLocaleFromRequest(req);
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
