"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import {
  fetchEventRating,
  roundRating,
} from "@abonten/services/reviews/ratingsQuery";

// Aggregate rating for one event's own reviews (event_review) -- distinct
// from getUserRating.ts, which averages the generic `review` table's rows
// about an organizer as a person, not this specific event.
//
// The average is now computed in Postgres (get_event_rating) instead of by
// pulling every approved review row over the wire and reducing it here. The
// RPC degrades to a 0/0 result on failure rather than throwing: the event
// detail page awaits this directly in a Promise.all with no try/catch, so a
// throw would 500 the whole page over a self-contained rating widget.
export async function getEventRating(eventId: string) {
  const { average, count } = await fetchEventRating(publicSupabase, eventId);
  return { averageRating: roundRating(average), totalRatings: count };
}
