import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  type PostEventCoreInput,
  postEventCore,
} from "@abonten/services/events/postEventCore";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";

// POST /api/mobile/events
//   { title, description, category, types[], address, latitude, longitude,
//     requireRegistration, currency, flyerPublicId, flyerVersion,
//     clientRequestId, capacity?, websiteUrl?, startsAt?, endsAt?,
//     specificDates?, freeEvent?, singleTicket?, multipleTickets? (each
//     with admits? and description?), groupDiscounts?,
//     promoCodes?, placeId?, refundPolicy?, refundCutoffHours?,
//     salesCloseBeforeEndMinutes? }
//
// Publishes an event. The flyer is uploaded from the device first (signed
// direct upload, kind "event_photo"); its public_id/version come in here.
// Runs the same postEventCore the web postEvent action runs.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  // Managing as a team: the chosen team, if the person's role covers this.
  const actor = await mobileActingFor(req, auth.user.id, "events.manage");
  if (actor.error) return apiJson(actor.error);

  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!body) {
      return apiJson({
        status: 400,
        message: tr("invalidRequestBody"),
      });
    }

    const str = (v: unknown): string | null =>
      typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

    const title = str(body.title);
    const description = str(body.description);
    const category = str(body.category);
    const address = str(body.address);
    const flyerPublicId = str(body.flyerPublicId);
    const flyerVersion = str(body.flyerVersion);
    const clientRequestId = str(body.clientRequestId);
    const types = Array.isArray(body.types)
      ? (body.types.filter((t) => typeof t === "string") as string[])
      : [];
    const latitude = typeof body.latitude === "number" ? body.latitude : null;
    const longitude =
      typeof body.longitude === "number" ? body.longitude : null;

    if (
      !title ||
      !description ||
      !category ||
      !address ||
      !flyerPublicId ||
      !flyerVersion ||
      !clientRequestId ||
      types.length === 0 ||
      latitude === null ||
      longitude === null
    ) {
      return apiJson({
        status: 400,
        message: tr("titleDescriptionCategoryTypesAddressLatitude"),
      });
    }

    const hasSingleRange = body.startsAt != null && body.endsAt != null;
    const hasSpecific =
      Array.isArray(body.specificDates) && body.specificDates.length > 0;
    if (!hasSingleRange && !hasSpecific) {
      return apiJson({
        status: 400,
        message: tr("provideEitherStartsatEndsatOrSpecificdates"),
      });
    }

    const capacity =
      typeof body.capacity === "number" && Number.isFinite(body.capacity)
        ? Math.trunc(body.capacity)
        : null;

    const input: PostEventCoreInput = {
      title,
      description,
      category,
      types,
      address,
      latitude,
      longitude,
      capacity,
      websiteUrl: str(body.websiteUrl),
      requireRegistration: body.requireRegistration === true,
      startsAt: hasSingleRange ? (body.startsAt as string) : null,
      endsAt: hasSingleRange ? (body.endsAt as string) : null,
      specificDates: hasSpecific
        ? (body.specificDates as { start: string; end: string }[])
        : null,
      freeEvent: body.freeEvent === true,
      singleTicket:
        body.singleTicket && typeof body.singleTicket === "object"
          ? (body.singleTicket as { price: number; quantity: number | null })
          : null,
      multipleTickets: Array.isArray(body.multipleTickets)
        ? (body.multipleTickets as PostEventCoreInput["multipleTickets"])
        : null,
      groupDiscounts: Array.isArray(body.groupDiscounts)
        ? (body.groupDiscounts as unknown[])
            .filter(
              (t): t is { minTickets: number; percentOff: number } =>
                !!t &&
                typeof (t as { minTickets?: unknown }).minTickets ===
                  "number" &&
                typeof (t as { percentOff?: unknown }).percentOff === "number",
            )
            .map((t) => ({
              minTickets: t.minTickets,
              percentOff: t.percentOff,
            }))
        : null,
      promoCodes: Array.isArray(body.promoCodes)
        ? (body.promoCodes as PostEventCoreInput["promoCodes"])
        : null,
      flyerPublicId,
      flyerVersion,
      clientRequestId,
      placeId: str(body.placeId),
      draftId: str(body.draftId),
      refundPolicy: str(body.refundPolicy),
      refundCutoffHours:
        typeof body.refundCutoffHours === "number"
          ? body.refundCutoffHours
          : null,
      // null or omitted = sales close at the start; anything that isn't a
      // choice is refused by the service.
      salesCloseBeforeEndMinutes: (body.salesCloseBeforeEndMinutes ?? null) as
        | number
        | null,
    };

    const result = await postEventCore(auth.supabase, actor.accountId, input);
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /events failed", error);
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
