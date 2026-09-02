import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { requestPlaceBookingCore } from "@abonten/services/places/requestPlaceBookingCore";

// POST /api/mobile/places/:placeId/bookings
//   { serviceId?, requestedTime (ISO), partySize?, note? }
// Reservation REQUEST only — inserts a pending place_booking and notifies
// the owner. Same rules as the web requestPlaceBooking action (both call
// requestPlaceBookingCore). 400 = bad time / party size; 404 = no such
// place; 400 = own place.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ placeId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { placeId } = await ctx.params;

    const body = (await req.json().catch(() => null)) as {
      serviceId?: unknown;
      requestedTime?: unknown;
      partySize?: unknown;
      note?: unknown;
    } | null;

    const requestedTime =
      typeof body?.requestedTime === "string" && body.requestedTime.length > 0
        ? body.requestedTime
        : null;

    if (!requestedTime) {
      return apiJson({
        status: 400,
        message: "requestedTime (ISO string) is required",
      });
    }

    const serviceId =
      typeof body?.serviceId === "string" && body.serviceId.length > 0
        ? body.serviceId
        : null;
    const partySize =
      typeof body?.partySize === "number" ? body.partySize : null;
    const note =
      typeof body?.note === "string" && body.note.trim().length > 0
        ? body.note.trim()
        : null;

    const result = await requestPlaceBookingCore(auth.supabase, auth.user.id, {
      placeId,
      serviceId,
      requestedTime,
      partySize,
      note,
    });

    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /places/:id/bookings failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
