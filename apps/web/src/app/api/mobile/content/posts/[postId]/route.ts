import {
  mobileActingFor,
  mobileContentPublisher,
} from "@/app/api/mobile/_lib/actor";
import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import {
  deleteContentPostCore,
  getContentPostCore,
  updateContentPostCore,
} from "@abonten/services/content/contentPostCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import {
  contentPostIdSchema,
  updateContentPostSchema,
} from "@abonten/validation/contentSchemas";

// GET /api/mobile/content/posts/[postId] — one post (410 for an ended Story)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  bindLocaleFromRequest(req);
  const { postId } = await params;
  return discoveryRoute(
    req,
    {
      schema: contentPostIdSchema,
      label: "GET /content/posts/[postId]",
      allowAnonymous: true,
      params: { postId },
    },
    async ({ svc, userId, data }) => {
      // A team's draft or ended Story opens for the members who post for it.
      const publisher = userId
        ? await mobileContentPublisher(req, userId)
        : null;
      return getContentPostCore(
        svc,
        userId,
        data.postId,
        publisher && !publisher.blocked ? publisher.accountId : null,
      );
    },
  );
}

// PATCH /api/mobile/content/posts/[postId] — edit an own post
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  bindLocaleFromRequest(req);
  const { postId } = await params;
  return discoveryRoute(
    req,
    {
      schema: updateContentPostSchema,
      label: "PATCH /content/posts/[postId]",
      params: { postId },
    },
    async ({ svc, userId, data }) => {
      const actor = await mobileActingFor(
        req,
        signedIn(userId),
        "content.post",
      );
      if (actor.error) return actor.error;
      return updateContentPostCore(svc, actor.accountId, data);
    },
  );
}

// DELETE /api/mobile/content/posts/[postId] — soft-delete an own post
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  bindLocaleFromRequest(req);
  const { postId } = await params;
  return discoveryRoute(
    req,
    {
      schema: contentPostIdSchema,
      label: "DELETE /content/posts/[postId]",
      params: { postId },
    },
    async ({ svc, userId, data }) => {
      const actor = await mobileActingFor(
        req,
        signedIn(userId),
        "content.post",
      );
      if (actor.error) return actor.error;
      return deleteContentPostCore(svc, actor.accountId, data.postId);
    },
  );
}
