import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { cancelPlaceBookingCore } from "@abonten/services/places/requestPlaceBookingCore";

// POST /api/mobile/places/:placeId/bookings/cancel
//   { bookingId }
// Customer-only cancellation of their own booking (pending or accepted).
// Same rules as the web cancelPlaceBooking action. `placeId` in the path is
// only for routing symmetry — the booking is resolved by id and the
// self-only check is on customer_id. 403 unless the caller owns the
// booking; 409 if it's already final.
export async function POST(
  req: Request,
  _ctx: { params: Promise<{ placeId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      bookingId?: unknown;
    } | null;

    const bookingId =
      typeof body?.bookingId === "string" && body.bookingId.length > 0
        ? body.bookingId
        : null;

    if (!bookingId) {
      return apiJson({ status: 400, message: "bookingId is required" });
    }

    const result = await cancelPlaceBookingCore(
      auth.supabase,
      auth.user.id,
      bookingId,
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /places/:id/bookings/cancel failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
