"use server";

import { createClient } from "@/config/supabase/server";
import { validateLocationInput } from "@/utils/validateLocationInput";
import { v2 as cloudinary } from "cloudinary";
import { saveEventFlyerToCloudinary } from "./saveEventFlyerToCloudinary";

export type UpdateEventInput = {
  eventId: string;
  title: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  capacity?: number;
  website_url?: string;
  category: string;
  types: string[];
  checked: boolean;
  featured?: boolean;
  starts_at?: Date;
  ends_at?: Date;
  specific_dates?: { start: Date; end: Date }[];
  selectedFile?: File | null;
};

/**
 * Edits the core, non-ticketing fields of an event an organizer already
 * created — title/description/location/schedule/flyer/category/featured.
 * Deliberately does NOT touch ticket_type, promo_code, or receiving_account:
 * ticket_type.quantity is a live, compare-and-swap "remaining stock"
 * counter (see ticketInventory.ts), issued `ticket` rows carry no price of
 * their own (they're only ever priced by joining live to ticket_type), and
 * ticket_type/promo_code are FK-referenced by tickets/checkouts/usage rows
 * — editing or replacing them here would either silently reprice
 * already-sold tickets or risk cascading deletes into real purchase
 * history. Ticketing stays exactly as configured at creation.
 */
export async function updateEvent(formData: UpdateEventInput) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const {
    eventId,
    title,
    description,
    address,
    latitude,
    longitude,
    capacity,
    website_url,
    category,
    types,
    checked,
    featured,
    starts_at,
    ends_at,
    specific_dates,
    selectedFile,
  } = formData;

  const locationCheck = validateLocationInput({ address, latitude, longitude });
  if (!locationCheck.valid) {
    return { status: 400, message: locationCheck.message };
  }

  // Ownership-scoped fetch first (same pattern as deleteEvent.ts) — also
  // gives us the current flyer so we only touch Cloudinary when a new file
  // was actually supplied.
  const { data: existingEvent, error: fetchError } = await supabase
    .from("event")
    .select("flyer_public_id, flyer_version")
    .eq("id", eventId)
    .eq("organizer_id", user.id)
    .single();

  if (fetchError || !existingEvent) {
    return { status: 404, message: "Event not found or unauthorized" };
  }

  let flyerPublicId = existingEvent.flyer_public_id;
  let flyerVersion = existingEvent.flyer_version;
  let previousFlyerPublicId: string | null = null;

  if (selectedFile) {
    const flyerUpload = await saveEventFlyerToCloudinary(selectedFile);

    if (!flyerUpload?.public_id || !flyerUpload?.version) {
      return {
        status: 500,
        message:
          (flyerUpload as { error?: string })?.error ??
          "Flyer upload to Cloudinary failed.",
      };
    }

    previousFlyerPublicId = flyerPublicId;
    flyerPublicId = flyerUpload.public_id;
    flyerVersion = flyerUpload.version;
  }

  const formattedTitle = title
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  const isSpecificEvent = specific_dates && specific_dates.length > 0;
  const eventStartDate = isSpecificEvent ? null : (starts_at ?? null);
  const eventEndDate = isSpecificEvent ? null : (ends_at ?? null);

  const { error: updateError } = await supabase
    .from("event")
    .update({
      title: formattedTitle,
      description,
      address: { full_address: address },
      location: `POINT(${longitude} ${latitude})`,
      capacity,
      website_url,
      event_category: category,
      event_type: types,
      require_registration: checked,
      featured: featured ?? false,
      starts_at: eventStartDate,
      ends_at: eventEndDate,
      flyer_public_id: flyerPublicId,
      flyer_version: flyerVersion,
    })
    .eq("id", eventId)
    .eq("organizer_id", user.id);

  if (updateError) {
    return {
      status: 500,
      message: `Error updating event: ${updateError.message}`,
    };
  }

  // Replace the schedule wholesale: no other table has an FK to
  // event_occurrence.id (tickets/attendance are keyed by event_id, not by a
  // specific occurrence), so a full delete + reinsert is safe — same
  // approach postEvent.ts uses for the initial insert.
  const { error: deleteOccurrenceError } = await supabase
    .from("event_occurrence")
    .delete()
    .eq("event_id", eventId);

  if (deleteOccurrenceError) {
    return {
      status: 500,
      message: `Error updating event dates: ${deleteOccurrenceError.message}`,
    };
  }

  if (isSpecificEvent && specific_dates) {
    const occurrencePayload = specific_dates.map((entry) => ({
      event_id: eventId,
      starts_at: entry.start,
      ends_at: entry.end,
    }));

    const { error: insertOccurrenceError } = await supabase
      .from("event_occurrence")
      .insert(occurrencePayload);

    if (insertOccurrenceError) {
      return {
        status: 500,
        message: `Error inserting event occurrences: ${insertOccurrenceError.message}`,
      };
    }
  }

  if (previousFlyerPublicId) {
    try {
      await cloudinary.uploader.destroy(previousFlyerPublicId);
    } catch (cloudError) {
      console.error("Cloudinary deletion of old flyer failed:", cloudError);
      // Not failing the whole update if cleanup of the old flyer fails.
    }
  }

  return { status: 200, message: "Event updated successfully!" };
}
