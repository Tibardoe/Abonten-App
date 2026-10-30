import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { createNotificationCore } from "./createNotification";

// "Someone bought 2 tickets for Afro Night": the organizer's in-app notice
// and push for every completed order, paid or free. Called once per order
// after the tickets exist (generateTicket for paid and basket orders,
// registerForFreeEventCore for a free RSVP), never on an idempotent replay.
// Best-effort: a failure is logged and never fails the order.

export async function notifyOrganizerOfSale(input: {
  eventId: string;
  buyerId: string;
  /** Tickets in this order. */
  count: number;
  /** A free ticket was reserved rather than bought. */
  free: boolean;
}): Promise<void> {
  try {
    const db = getSupabaseServiceClient();
    const { data: event, error } = await db
      .from("event")
      .select("organizer_id, title, flyer_public_id, flyer_version")
      .eq("id", input.eventId)
      .maybeSingle();
    if (error || !event) {
      logger.error(
        `notifyOrganizerOfSale: event ${input.eventId} not read: ${error?.message}`,
      );
      return;
    }
    // An organizer buying for their own event needs no notice.
    if (!event.organizer_id || event.organizer_id === input.buyerId) return;

    const id = input.free ? "ticket_reserved" : "ticket_sold";
    const result = await createNotificationCore(db, {
      userId: event.organizer_id,
      type: id,
      notice: {
        id,
        params: { title: event.title ?? null, count: input.count },
      },
      link: `/manage/events/${input.eventId}`,
      data: { kind: "ticket_sale", eventId: input.eventId },
      imagePublicId: event.flyer_public_id ?? null,
      imageVersion: event.flyer_version ?? null,
    });
    if (result.status !== 200) {
      logger.error(`notifyOrganizerOfSale: ${result.message}`);
    }
  } catch (error) {
    logger.error("notifyOrganizerOfSale failed (notice skipped)", error);
  }
}
