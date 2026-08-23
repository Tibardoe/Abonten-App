"use server";

import { publicSupabase } from "@/config/supabase/publicClient";

/**
 * Public, no-auth lookup of which events currently have an active (paid)
 * promotion. "Active" is always computed as `ends_at > now()` at query time,
 * never stored — same convention as the rest of the promotion feature (see
 * activateEventPromotion.ts). Consumed by
 * src/app/(pages)/events/location/[location]/page.tsx to fold paid
 * promotion into the existing featured-eligibility check
 * (dailyEventCache.ts's getFeaturedEvents) without touching that function
 * itself — a promoted event is simply treated the same as an event whose
 * organizer self-toggled `featured`.
 */
export default async function getActivePromotedEventIds(): Promise<
  Set<string>
> {
  const { data, error } = await publicSupabase
    .from("event_promotion")
    .select("event_id")
    .gt("ends_at", new Date().toISOString());

  if (error) {
    console.log(`Error fetching active event promotions: ${error.message}`);
    return new Set();
  }

  return new Set((data ?? []).map((row) => row.event_id as string));
}
