import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { respondToPlaceReviewCore } from "@abonten/services/places/placeBookingsReviewsCore";

// POST /api/mobile/organizer/places/:placeId/reviews/respond
//   { reviewId, response }
// Same as respondToPlaceReview(reviewId, response). 403 unless the caller
// owns the review's place.
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
    const response =
      typeof body?.response === "string" ? body.response.trim() : "";

    if (!reviewId || !response) {
      return apiJson({
        status: 400,
        message: "reviewId and a non-empty response are required",
      });
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
