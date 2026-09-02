import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { deleteHighlightSlideCore } from "@/utils/highlightDeleteCore";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/highlights/slide/delete   { slideId }
// Deletes one highlight slide the caller owns, Cloudinary asset first.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      slideId?: unknown;
    } | null;

    if (typeof body?.slideId !== "string" || body.slideId.length === 0) {
      return apiJson({ status: 400, message: "slideId is required" });
    }

    const result = await deleteHighlightSlideCore(
      auth.supabase,
      auth.user.id,
      body.slideId,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /highlights/slide/delete failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
