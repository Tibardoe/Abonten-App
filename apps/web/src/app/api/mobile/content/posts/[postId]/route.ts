import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import {
  deleteContentPostCore,
  getContentPostCore,
  updateContentPostCore,
} from "@abonten/services/content/contentPostCore";
import {
  contentPostIdSchema,
  updateContentPostSchema,
} from "@abonten/validation/contentSchemas";

// GET /api/mobile/content/posts/[postId] — one post (410 for an ended Story)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const { postId } = await params;
  return discoveryRoute(
    req,
    {
      schema: contentPostIdSchema,
      label: "GET /content/posts/[postId]",
      allowAnonymous: true,
      params: { postId },
    },
    ({ svc, userId, data, ip }) => getContentPostCore(svc, userId, data.postId),
  );
}

// PATCH /api/mobile/content/posts/[postId] — edit an own post
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const { postId } = await params;
  return discoveryRoute(
    req,
    {
      schema: updateContentPostSchema,
      label: "PATCH /content/posts/[postId]",
      params: { postId },
    },
    ({ svc, userId, data, ip }) =>
      updateContentPostCore(svc, signedIn(userId), data),
  );
}

// DELETE /api/mobile/content/posts/[postId] — soft-delete an own post
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const { postId } = await params;
  return discoveryRoute(
    req,
    {
      schema: contentPostIdSchema,
      label: "DELETE /content/posts/[postId]",
      params: { postId },
    },
    ({ svc, userId, data, ip }) =>
      deleteContentPostCore(svc, signedIn(userId), data.postId),
  );
}
