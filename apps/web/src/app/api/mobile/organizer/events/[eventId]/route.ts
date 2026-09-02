import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  type UpdateEventCoreInput,
  updateEventCore,
} from "@abonten/services/events/updateEventCore";

// PATCH /api/mobile/organizer/events/:eventId
//   { title, description, address, latitude, longitude, category, types[],
//     checked, capacity?, websiteUrl?, startsAt?, endsAt?, specificDates?,
//     flyerPublicId?, flyerVersion? }
//
// Edits the core, non-ticketing fields of the caller's own event. A
// replacement flyer is uploaded from the device first (signed direct
// upload, kind "event_flyer"); its public_id/version come in here, both
// omitted keeps the current flyer. Runs the same updateEventCore the web
// updateEvent action runs. Ticket types are a separate endpoint.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { eventId } = await params;
    if (!eventId) {
      return apiJson({ status: 400, message: "Missing event id" });
    }

    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!body) {
      return apiJson({ status: 400, message: "Invalid request body" });
    }

    const str = (v: unknown): string | null =>
      typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

    const title = str(body.title);
    const description = str(body.description);
    const address = str(body.address);
    const category = str(body.category);
    const types = Array.isArray(body.types)
      ? (body.types.filter((t) => typeof t === "string") as string[])
      : [];
    const latitude = typeof body.latitude === "number" ? body.latitude : null;
    const longitude =
      typeof body.longitude === "number" ? body.longitude : null;

    if (
      !title ||
      !description ||
      !address ||
      !category ||
      types.length === 0 ||
      latitude === null ||
      longitude === null
    ) {
      return apiJson({
        status: 400,
        message:
          "title, description, address, category, types, latitude and longitude are required",
      });
    }

    const hasSingleRange = body.startsAt != null && body.endsAt != null;
    const hasSpecific =
      Array.isArray(body.specificDates) && body.specificDates.length > 0;
    if (!hasSingleRange && !hasSpecific) {
      return apiJson({
        status: 400,
        message: "Provide either startsAt + endsAt, or specificDates",
      });
    }

    const capacity =
      typeof body.capacity === "number" && Number.isFinite(body.capacity)
        ? Math.trunc(body.capacity)
        : null;

    const flyerPublicId = str(body.flyerPublicId);
    const flyerVersion = str(body.flyerVersion);

    const input: UpdateEventCoreInput = {
      eventId,
      title,
      description,
      address,
      latitude,
      longitude,
      capacity,
      website_url: str(body.websiteUrl),
      category,
      types,
      checked: body.checked === true,
      starts_at: hasSingleRange ? (body.startsAt as string) : null,
      ends_at: hasSingleRange ? (body.endsAt as string) : null,
      specific_dates: hasSpecific
        ? (body.specificDates as { start: string; end: string }[])
        : null,
      flyerPublicId: flyerPublicId && flyerVersion ? flyerPublicId : undefined,
      flyerVersion: flyerPublicId && flyerVersion ? flyerVersion : undefined,
    };

    const result = await updateEventCore(auth.supabase, auth.user.id, input);
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile PATCH /organizer/events/:eventId failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
