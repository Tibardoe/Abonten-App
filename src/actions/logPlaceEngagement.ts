"use server";

import { publicSupabase } from "@/config/supabase/publicClient";

// Mirrors place_analytics_event_type_check in the migration exactly --
// "promotion_impression" added by 20260826090000_add_place_promotions.sql's
// CHECK constraint update, kept in sync here (Milestone 5, Featured Places).
const ALLOWED_EVENT_TYPES = [
  "view",
  "direction_click",
  "phone_click",
  "whatsapp_click",
  "website_click",
  "booking_click",
  "promotion_impression",
] as const;

type PlaceEngagementEventType = (typeof ALLOWED_EVENT_TYPES)[number];

function isAllowedEventType(value: string): value is PlaceEngagementEventType {
  return (ALLOWED_EVENT_TYPES as readonly string[]).includes(value);
}

// No auth required -- anonymous visitors browsing a place's page still
// generate view/click analytics, same reasoning as the public,
// no-auth-check RPCs in getNearByPlaces.ts/getQueriedPlaces.ts. `eventType`
// is typed as a plain string (not the narrower union) precisely so this
// runtime check is real defense-in-depth against a caller that bypasses
// TypeScript, not just a compile-time-only guard.
export async function logPlaceEngagement(placeId: string, eventType: string) {
  if (!isAllowedEventType(eventType)) {
    return { status: 400, message: "Invalid engagement event type" };
  }

  const supabase = publicSupabase;

  const { error } = await supabase.from("place_analytics_event").insert({
    place_id: placeId,
    event_type: eventType,
  });

  if (error) {
    console.log(`Error logging place engagement: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200 };
}
