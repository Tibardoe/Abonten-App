import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { fetchPlaceBookingsPage } from "@/utils/placeBookingsReviewsCore";
import { logger } from "@abonten/core/logger";
import type { BookingStatus } from "@abonten/types/placeBookingType";

const VALID_STATUSES: BookingStatus[] = [
  "pending",
  "accepted",
  "declined",
  "cancelled",
];

// GET /api/mobile/organizer/places/:placeId/bookings?status=&cursor=&pageSize=
// Owner-only, cursor-paginated booking requests for one place. Omit
// `status` for the "All" view. 403 unless the place is the caller's.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { placeId } = await params;
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status");
    const cursor = url.searchParams.get("cursor");
    const pageSizeParam = url.searchParams.get("pageSize");

    const status =
      statusParam && VALID_STATUSES.includes(statusParam as BookingStatus)
        ? (statusParam as BookingStatus)
        : undefined;
    const pageSize = pageSizeParam ? Number(pageSizeParam) : undefined;

    const result = await fetchPlaceBookingsPage(
      auth.supabase,
      auth.user.id,
      placeId,
      {
        status,
        cursor,
        pageSize:
          pageSize && Number.isFinite(pageSize) && pageSize > 0
            ? pageSize
            : undefined,
      },
    );

    return apiJson(result);
  } catch (error) {
    logger.error("mobile GET /organizer/places/:id/bookings failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
