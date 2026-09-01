import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { updatePlaceOpeningHoursCore } from "@/utils/placeHoursStatusCore";
import { logger } from "@abonten/core/logger";
import type { PlaceOpeningHoursInput } from "@abonten/types/placeType";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// PUT /api/mobile/organizer/places/:placeId/hours
//   { openingHours: { dayOfWeek, openTime, closeTime, isClosed }[] }
// Replaces the place's whole weekly schedule — same body as
// updatePlaceOpeningHours. 404 unless the place is the caller's.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { placeId } = await params;
    const body = (await req.json().catch(() => null)) as {
      openingHours?: unknown;
    } | null;

    const raw = Array.isArray(body?.openingHours) ? body.openingHours : null;
    if (!raw) {
      return apiJson({
        status: 400,
        message: "openingHours (array) is required",
      });
    }

    const openingHours: PlaceOpeningHoursInput[] = [];
    for (const entry of raw) {
      const e = entry as Record<string, unknown>;
      const dayOfWeek = Number(e.dayOfWeek);
      const isClosed = e.isClosed === true;
      const openTime = typeof e.openTime === "string" ? e.openTime : "";
      const closeTime = typeof e.closeTime === "string" ? e.closeTime : "";

      if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        return apiJson({ status: 400, message: "Invalid dayOfWeek" });
      }
      if (!isClosed && (!TIME_RE.test(openTime) || !TIME_RE.test(closeTime))) {
        return apiJson({
          status: 400,
          message: "Open days need openTime and closeTime as HH:MM",
        });
      }

      // The place_opening_hours.open_time/close_time columns are `time` and
      // populated even for closed days (same as the create path) — keep a
      // valid HH:MM, defaulting when a closed day arrives without one.
      openingHours.push({
        dayOfWeek,
        openTime: TIME_RE.test(openTime) ? openTime : "09:00",
        closeTime: TIME_RE.test(closeTime) ? closeTime : "17:00",
        isClosed,
      });
    }

    const result = await updatePlaceOpeningHoursCore(
      auth.supabase,
      auth.user.id,
      placeId,
      openingHours,
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile PUT /organizer/places/:id/hours failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
