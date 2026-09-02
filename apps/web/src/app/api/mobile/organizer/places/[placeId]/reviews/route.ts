import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { fetchPlaceReviewsForOwner } from "@abonten/services/places/placeBookingsReviewsCore";

// GET /api/mobile/organizer/places/:placeId/reviews?cursor=&pageSize=
// Owner-only, cursor-paginated approved reviews for one place (the same
// list the public detail page shows, gated to the owner). 403 unless the
// place is the caller's.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { placeId } = await params;
    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor");
    const pageSizeParam = url.searchParams.get("pageSize");
    const pageSize = pageSizeParam ? Number(pageSizeParam) : undefined;

    const result = await fetchPlaceReviewsForOwner(
      auth.supabase,
      auth.user.id,
      placeId,
      {
        cursor,
        pageSize:
          pageSize && Number.isFinite(pageSize) && pageSize > 0
            ? pageSize
            : undefined,
      },
    );

    return apiJson(result);
  } catch (error) {
    logger.error("mobile GET /organizer/places/:id/reviews failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
