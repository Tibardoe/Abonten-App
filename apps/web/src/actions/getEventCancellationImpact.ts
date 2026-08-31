"use server";

import { createClient } from "@/config/supabase/server";
import {
  type EventCancellationImpact,
  type EventCancellationImpactResult,
  getEventCancellationImpactCore,
} from "@/utils/cancelEventCore";

export type { EventCancellationImpact };

/**
 * Server-verified counts for the cancel-event confirmation dialog -- never
 * trust client-side assumptions about how many attendees/paid tickets an
 * event has. Backed by the get_event_cancellation_impact RPC, which has to
 * be SECURITY DEFINER since ticket/attendance RLS is scoped to the ticket
 * holder's own user_id, not the organizer.
 */
export default async function getEventCancellationImpact(
  eventId: string,
): Promise<EventCancellationImpactResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  return getEventCancellationImpactCore(supabase, eventId);
}
