import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { setEventGroupDiscountsCore } from "@abonten/services/events/eventGroupDiscountsCore";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { setEventGroupDiscountsSchema } from "@abonten/validation/groupPricingSchemas";

// PUT /api/mobile/organizer/events/:eventId/group-prices
//   { tiers: { minTickets, percentOff }[] }
//
// Replaces the caller's event's automatic group prices (an empty list
// removes them). Runs the same setEventGroupDiscountsCore as the web
// setEventGroupDiscounts action (docs/architecture/group-tickets-and-prices.md).
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  // Managing as a team: the named team, if the person's role covers this.
  const actor = await mobileActingFor(req, auth.user.id, "events.manage");
  if (actor.error) return apiJson(actor.error);

  try {
    const { eventId } = await params;
    const body = await req.json().catch(() => null);
    const parsed = setEventGroupDiscountsSchema.safeParse({
      ...(body && typeof body === "object" ? body : {}),
      eventId,
    });
    if (!parsed.success) {
      return apiJson({ status: 400, message: tr("invalidRequestBody") });
    }

    const result = await setEventGroupDiscountsCore(
      auth.supabase,
      actor.accountId,
      parsed.data,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile PUT /organizer/events/:eventId/group-prices failed",
      error,
    );
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
