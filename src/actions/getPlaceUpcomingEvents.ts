"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import type { UserPostType } from "@/types/postsType";
import { logger } from "@/utils/logger";
import { getEventAttendanceCounts } from "./getAttendace";

// Public read (no auth check) -- same "browsable signed-out" reasoning as
// getQueriedEvents.ts/getNearByEvents.ts. Only single-date events with a
// future starts_at are matched here; a multi-date event's starts_at is null
// (see postEvent.ts), so it won't appear even if a future occurrence
// exists -- same known gap getFilteredEvents.ts's date-window filters call
// out for other event lists, not something new introduced here.
export async function getPlaceUpcomingEvents(placeId: string) {
  const supabase = publicSupabase;

  const { data, error } = await supabase
    .from("event")
    .select(
      "*, ticket_type(id, type, price, currency), occurrences:event_occurrence(*)",
    )
    .eq("place_id", placeId)
    .eq("status", "published")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });

  if (error) {
    logger.error(`Error fetching place's upcoming events: ${error.message}`);
    return { status: 500, data: [], message: "Something went wrong!" };
  }

  const events = data ?? [];

  // EventCard needs min_price/currency/attendanceCount, same as every other
  // event list in the app (see getNearByEvents.ts) -- without these, price
  // shows as undefined and attendance as 0 regardless of real sales.
  const attendanceCounts = await getEventAttendanceCounts(
    events.map((event) => event.id),
  );

  const eventsWithDerivedFields = events.map((event) => {
    const ticketTypes = (event.ticket_type ?? []) as {
      price: number | null;
      currency: string | null;
    }[];
    const cheapest = ticketTypes.reduce<
      (typeof ticketTypes)[number] | undefined
    >((min, ticket) => {
      if (ticket.price == null) return min;
      if (!min || (min.price ?? Number.POSITIVE_INFINITY) > ticket.price) {
        return ticket;
      }
      return min;
    }, undefined);

    return {
      ...event,
      min_price: cheapest?.price ?? null,
      currency: cheapest?.currency ?? null,
      attendanceCount: attendanceCounts[event.id] ?? 0,
    };
  });

  return { status: 200, data: eventsWithDerivedFields as UserPostType[] };
}
