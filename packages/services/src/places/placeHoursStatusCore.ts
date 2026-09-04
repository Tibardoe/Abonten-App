import type { Database } from "@abonten/types/database.types";
import type { PlaceOpeningHoursInput } from "@abonten/types/placeType";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth bodies of updatePlaceOpeningHours / setPlaceTemporaryStatus,
// lifted so the mobile per-place Hours & Status routes run the same logic.
// Both prove ownership with an owner-scoped `place` fetch. NOT "use server".

export type PlaceTemporaryStatus =
  | "temporarily_closed"
  | "permanently_closed"
  | null;

export type PlaceHoursStatusCoreResult = {
  status: 200 | 403 | 404 | 500;
  message: string;
};

async function assertOwnsPlace(
  supabase: SupabaseClient<Database>,
  userId: string,
  placeId: string,
): Promise<PlaceHoursStatusCoreResult | null> {
  const { data: place, error } = await supabase
    .from("place")
    .select("id")
    .eq("id", placeId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (error || !place) {
    return { status: 404, message: "Place not found or unauthorized" };
  }
  return null;
}

// Replaces the whole weekly schedule wholesale (no FK to
// place_opening_hours.id, so delete + reinsert is safe).
export async function updatePlaceOpeningHoursCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  placeId: string,
  openingHours: PlaceOpeningHoursInput[],
): Promise<PlaceHoursStatusCoreResult> {
  const denied = await assertOwnsPlace(supabase, userId, placeId);
  if (denied) return denied;

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

export async function setPlaceTemporaryStatusCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  placeId: string,
  temporaryStatus: PlaceTemporaryStatus,
  temporaryStatusNote?: string | null,
): Promise<PlaceHoursStatusCoreResult> {
  const denied = await assertOwnsPlace(supabase, userId, placeId);
  if (denied) return denied;

  const { error: updateError } = await supabase
    .from("place")
    .update({
      temporary_status: temporaryStatus,
      // A note without a status is meaningless — clearing the status always
      // clears the note too, so the two fields can't drift out of sync.
      temporary_status_note: temporaryStatus
        ? (temporaryStatusNote ?? null)
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", placeId)
    .eq("owner_id", userId);

  if (updateError) {
    return {
      status: 500,
      message: `Error updating place status: ${updateError.message}`,
    };
  }

  return { status: 200, message: "Place status updated successfully!" };
}
