"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";

/**
 * Whether the current user has an active free-event registration
 * ("I'm Attending") for this event, and the ticket id backing it — needed so
 * the Event Details page's RSVP button can offer "Cancel Attendance"
 * without a second round trip. For an absolutely free event there is only
 * ever one ticket_type ("FREE"), so any attending attendance row for this
 * event + user is necessarily that registration.
 */
export default async function getUserFreeRegistrationStatus(eventId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, isAttending: false, ticketId: null };
  }

  const { data, error } = await supabase
    .from("attendance")
    .select("ticket_id")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .eq("status", "attending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error(`Failed fetching free registration status: ${error.message}`);
    return { status: 500, isAttending: false, ticketId: null };
  }

  return {
    status: 200,
    isAttending: !!data,
    ticketId: data?.ticket_id ?? null,
  };
}
