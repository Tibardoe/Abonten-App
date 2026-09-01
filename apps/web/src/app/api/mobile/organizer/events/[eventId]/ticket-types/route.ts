import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import {
  type UpdateEventTicketTypesCoreInput,
  updateEventTicketTypesCore,
} from "@/utils/updateEventTicketTypesCore";
import { logger } from "@abonten/core/logger";

// PUT /api/mobile/organizer/events/:eventId/ticket-types
//   { currency?, freeEvent?, singleTicket?: { price, quantity } | null,
//     multipleTickets?: { type, price, quantity, availableFrom?,
//                         availableUntil? }[] | null }
//
// Replaces the caller's event's ticket types. Fully editable until the
// event's first confirmed ticket, read-only after (409). Runs the same
// updateEventTicketTypesCore the web updateEventTicketTypes action runs.
export async function PUT(
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

    const rawSingle =
      body.singleTicket && typeof body.singleTicket === "object"
        ? (body.singleTicket as { price?: unknown; quantity?: unknown })
        : null;
    const singleTicket =
      rawSingle && typeof rawSingle.price === "number"
        ? {
            price: rawSingle.price,
            quantity:
              typeof rawSingle.quantity === "number"
                ? rawSingle.quantity
                : null,
          }
        : null;

    const multipleTickets = Array.isArray(body.multipleTickets)
      ? (body.multipleTickets as Record<string, unknown>[])
          .map((t) => ({
            type: str(t.type) ?? "",
            price: typeof t.price === "number" ? t.price : Number.NaN,
            quantity: typeof t.quantity === "number" ? t.quantity : null,
            availableFrom: str(t.availableFrom),
            availableUntil: str(t.availableUntil),
          }))
          .filter((t) => t.type && Number.isFinite(t.price))
      : [];

    const input: UpdateEventTicketTypesCoreInput = {
      eventId,
      currency: str(body.currency) ?? "GHS",
      freeEvent: body.freeEvent === true,
      singleTicket,
      multipleTickets,
    };

    const result = await updateEventTicketTypesCore(
      auth.supabase,
      auth.user.id,
      input,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile PUT /organizer/events/:eventId/ticket-types failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
