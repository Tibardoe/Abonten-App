import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  deletePlaceReviewResponseCore,
  respondToPlaceReviewCore,
} from "@abonten/services/reviews/reviewResponseCore";

// POST   /api/mobile/organizer/places/:placeId/reviews/respond  { reviewId, response }
//   Create OR edit the owner's reply. 403 unless the caller owns the place.
// DELETE /api/mobile/organizer/places/:placeId/reviews/respond?reviewId=...
//   Remove the owner's reply. Idempotent.
export async function POST(
  req: Request,
  _ctx: { params: Promise<{ placeId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      reviewId?: unknown;
      response?: unknown;
    } | null;

    const reviewId =
      typeof body?.reviewId === "string" && body.reviewId.length > 0
        ? body.reviewId
        : null;
    const response = typeof body?.response === "string" ? body.response : "";

    if (!reviewId) {
      return apiJson({ status: 400, message: "reviewId is required" });
    }

    const result = await respondToPlaceReviewCore(
      auth.supabase,
      auth.user.id,
      reviewId,
      response,
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile POST /organizer/places/:id/reviews/respond failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}

export async function DELETE(
  req: Request,
  _ctx: { params: Promise<{ placeId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const reviewId = new URL(req.url).searchParams.get("reviewId");

    if (!reviewId) {
      return apiJson({ status: 400, message: "reviewId is required" });
    }

    const result = await deletePlaceReviewResponseCore(
      auth.supabase,
      auth.user.id,
      reviewId,
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile DELETE /organizer/places/:id/reviews/respond failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
