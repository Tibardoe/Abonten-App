import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { respondToPlaceBookingCore } from "@/utils/placeBookingsReviewsCore";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/organizer/places/:placeId/bookings/respond
//   { bookingId, decision: "accept" | "decline" }
// Same body as respondToPlaceBooking. 403 unless the caller owns the
// booking's place; 409 if it was already responded to.
export async function POST(
  req: Request,
  _ctx: { params: Promise<{ placeId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      bookingId?: unknown;
      decision?: unknown;
    } | null;

    const bookingId =
      typeof body?.bookingId === "string" && body.bookingId.length > 0
        ? body.bookingId
        : null;
    const decision =
      body?.decision === "accept" || body?.decision === "decline"
        ? body.decision
        : null;

    if (!bookingId || !decision) {
      return apiJson({
        status: 400,
        message: "bookingId and decision ('accept' | 'decline') are required",
      });
    }

    const result = await respondToPlaceBookingCore(
      auth.supabase,
      auth.user.id,
      bookingId,
      decision,
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile POST /organizer/places/:id/bookings/respond failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
