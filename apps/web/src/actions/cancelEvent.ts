"use server";

import { createClient } from "@/config/supabase/server";
import {
  type CancelEventResult,
  cancelEventCore,
} from "@/utils/cancelEventCore";

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

  return cancelEventCore(supabase, eventId);
}
