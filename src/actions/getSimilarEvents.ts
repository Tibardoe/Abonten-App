import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";
import { getEventAttendanceCounts } from "./getAttendace";

export async function getSimilarEvents(
  category: string,
  lng: number,
  lat: number,
) {
  const supabase = await createClient();

  const { data: similarEvents, error: similarEventsError } = await supabase
    .rpc("get_similar_events", {
      input_category: category,
      input_location: `SRID=4326;POINT(${lng} ${lat})`,
      input_radius_km: 10,
    })
    .order("starts_at", { ascending: true })
    // Safety cap: this feeds a small "similar events" widget, not a full
    // list page, so a tight cap is intentional here rather than a fallback.
    .limit(20);

  if (similarEventsError) {
    logger.error(similarEventsError.message);

    return {
      status: 500,
      message: `Error fetching similar events: ${similarEventsError.message}`,
    };
  }

  // get_similar_events, unlike get_filtered_events/get_nearby_events, has no
  // attendance_count column at all — every similar-event card always showed
  // 0 attending regardless of real ticket sales. Merged in the same way
  // getUserPosts.ts/getEventsInWindow.ts already do for their own listings.
  const attendanceCounts = await getEventAttendanceCounts(
    (similarEvents ?? []).map((event: { id: string }) => event.id),
  );

  // get_similar_events returns ticket_price/ticket_currency, unlike
  // get_filtered_events/get_nearby_events which return min_price/currency —
  // EventCard (via EventsSlider) only reads the latter names, so without
  // this mapping every similar-event card's price badge renders
  // "undefined undefined" instead of "Free Entry" / the actual price.
  const mappedSimilarEvents = (similarEvents ?? []).map(
    (event: {
      id: string;
      ticket_price: number | null;
      ticket_currency: string | null;
    }) => ({
      ...event,
      min_price: event.ticket_price,
      currency: event.ticket_currency,
      attendanceCount: attendanceCounts[event.id] ?? 0,
    }),
  );

  return { status: 200, similarEvents: mappedSimilarEvents };
}
