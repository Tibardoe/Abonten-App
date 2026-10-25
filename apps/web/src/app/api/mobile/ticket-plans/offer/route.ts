import { discoveryRoute } from "@/app/api/mobile/_lib/discoveryRoute";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { getTicketPlanOfferCore } from "@abonten/services/ticketPlans/ticketPlanCore";
import { ticketPlanOfferSchema } from "@abonten/validation/ticketPlanSchemas";

// GET /api/mobile/ticket-plans/offer?eventId=…&occurrenceId=…
// Whether the event can be paid small small for this person, and on what
// terms. Works signed out; a Bearer token makes it personal ("already
// paying for this event", "your own event").
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  const res = await discoveryRoute(
    req,
    {
      schema: ticketPlanOfferSchema,
      label: "GET /ticket-plans/offer",
      allowAnonymous: true,
    },
    ({ userId, data }) => getTicketPlanOfferCore(userId, data),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
