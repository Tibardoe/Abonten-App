import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import {
  deleteContentMediaCore,
  retryContentMediaProcessingCore,
} from "@abonten/services/content/contentMediaCore";
import { z } from "zod";

// DELETE /api/mobile/content/media/[mediaId] — remove an unattached upload
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ mediaId: string }> },
) {
  const { mediaId } = await params;
  return discoveryRoute(
    req,
    {
      schema: z.object({ mediaId: z.string().uuid() }),
      label: "DELETE /content/media/[mediaId]",
      params: { mediaId },
    },
    ({ svc, userId, data, ip }) =>
      deleteContentMediaCore(svc, signedIn(userId), data.mediaId),
  );
}

// POST /api/mobile/content/media/[mediaId] — retry the optimised rendition
export async function POST(
  req: Request,
  { params }: { params: Promise<{ mediaId: string }> },
) {
  const { mediaId } = await params;
  return discoveryRoute(
    req,
    {
      schema: z.object({ mediaId: z.string().uuid() }),
      label: "POST /content/media/[mediaId]",
      params: { mediaId },
    },
    ({ svc, userId, data, ip }) =>
      retryContentMediaProcessingCore(svc, data.mediaId, {
        userId: signedIn(userId),
        staff: false,
      }),
  );
}
