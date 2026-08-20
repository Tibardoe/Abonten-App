"use server";

import { createClient } from "@/config/supabase/server";
import type { PlaceOpeningHoursInput } from "@/types/placeType";

// Replaces a place's entire weekly schedule wholesale: no other table has
// an FK to place_opening_hours.id, so a full delete + reinsert is safe,
// same approach create_place/updateEvent.ts's occurrence replacement uses.
export async function updatePlaceOpeningHours(
  placeId: string,
  openingHours: PlaceOpeningHoursInput[],
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: place, error: fetchError } = await supabase
    .from("place")
    .select("id")
    .eq("id", placeId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (fetchError || !place) {
    return { status: 404, message: "Place not found or unauthorized" };
  }

  const { error: deleteError } = await supabase
    .from("place_opening_hours")
    .delete()
    .eq("place_id", placeId);

  if (deleteError) {
    return {
      status: 500,
      message: `Error updating opening hours: ${deleteError.message}`,
    };
  }

  if (openingHours.length > 0) {
    const payload = openingHours.map((hour) => ({
      place_id: placeId,
      day_of_week: hour.dayOfWeek,
      open_time: hour.openTime,
      close_time: hour.closeTime,
      is_closed: hour.isClosed,
    }));

    const { error: insertError } = await supabase
      .from("place_opening_hours")
      .insert(payload);

    if (insertError) {
      return {
        status: 500,
        message: `Error inserting opening hours: ${insertError.message}`,
      };
    }
  }

  return { status: 200, message: "Opening hours updated successfully!" };
}
