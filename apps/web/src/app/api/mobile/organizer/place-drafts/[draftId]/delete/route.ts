import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { deletePlaceDraftCore } from "@/utils/placeDraftCore";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/organizer/place-drafts/:draftId/delete
// Deletes one place draft (row + best-effort Cloudinary cover, Cloudinary
// first). Same body as deletePlaceDraft. 404 unless it's the caller's.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { draftId } = await params;
    const result = await deletePlaceDraftCore(
      auth.supabase,
      auth.user.id,
      draftId,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile POST /organizer/place-drafts/:draftId/delete failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
