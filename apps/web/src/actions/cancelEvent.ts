"use server";

import eventCancellationNotification from "@/actions/eventCancellationNotification";
import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import {
  type CancelEventResult,
  cancelEventCore,
} from "@abonten/services/events/cancelEventCore";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

/**
 * Cancels an event and, atomically, cancels every ticket/attendance/paid
 * checkout row tied to it and notifies every affected attendee — all done
 * inside the cancel_event_and_release_tickets RPC (SECURITY DEFINER). The
 * Paystack refunds over the RPC's returned transaction list, and the
 * attendee-notification fan-out, both live in cancelEventCore so the mobile
 * /api/mobile/organizer/events/cancel route runs the identical path. See
 * cancelEventCore's header for the service-role / idempotency rationale.
 */
export default async function cancelEvent(
  eventId: string,
): Promise<CancelEventResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not Logged in" };
  }

  const result = await cancelEventCore(
    supabase,
    eventId,
    (eventTitle, attendees) =>
      after(() =>
        eventCancellationNotification(eventTitle, attendees).catch((error) =>
          logger.error(`Failed sending event cancellation emails: ${error}`),
        ),
      ),
  );

  // Cancellation atomically cancels every ticket/attendance/checkout row
  // tied to this event AND issues refunds over the affected transactions
  // (cancelEventCore -> issueRefundCore) -- this was previously the only
  // ticket/checkout-mutating action in the codebase with no revalidatePath
  // at all (contrast generateTicket.ts, cancelUserTicket.ts,
  // registerForFreeEvent.ts, all of which follow this same pattern), and
  // the resulting refunds change the organizer's own ledger balance, which
  // nothing was invalidating either.
  if (result.status === 200) {
    revalidatePath("/manage/my-events");
    revalidatePath(`/manage/events/${eventId}`);
    revalidatePath("/manage/dashboard");
    revalidatePath("/finances");
    revalidatePath("/transactions");
  }

  return result;
}
