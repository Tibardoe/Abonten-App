"use server";

import { createClient } from "@/config/supabase/server";
import { validateLocationInput } from "@/utils/validateLocationInput";
import { v2 as cloudinary } from "cloudinary";
import { revalidatePath } from "next/cache";
import getEventHasConfirmedParticipation from "./getEventHasConfirmedParticipation";
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
  starts_at?: Date;
  ends_at?: Date;
  specific_dates?: { start: Date; end: Date }[];
  selectedFile?: File | null;
};

/**
 * Edits the core, non-ticketing fields of an event an organizer already
 * created — title/description/location/schedule/flyer/category. Featuring an
 * event is handled exclusively by the paid Promotion flow (Manage -> Events
 * -> Promotion), not by this action.
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
    starts_at,
    ends_at,
    specific_dates,
    selectedFile,
  } = formData;

  const locationCheck = validateLocationInput({ address, latitude, longitude });
  if (!locationCheck.valid) {
    return { status: 400, message: locationCheck.message };
  }

  const isSpecificEvent = specific_dates && specific_dates.length > 0;

  // Ownership-scoped fetch first (same pattern as deleteEvent.ts) — also
  // gives us the current flyer (so we only touch Cloudinary when a new file
  // was actually supplied) and the current schedule/location/capacity, used
  // below to detect an attempted change to a locked field once the event
  // has confirmed tickets.
  const { data: existingEvent, error: fetchError } = await supabase
    .from("event")
    .select(
      "flyer_public_id, flyer_version, starts_at, ends_at, address, capacity, event_code, event_occurrence(starts_at, ends_at)",
    )
    .eq("id", eventId)
    .eq("organizer_id", user.id)
    .single();

  if (fetchError || !existingEvent) {
    return { status: 404, message: "Event not found or unauthorized" };
  }

  // Dates, location and capacity could affect people who already hold a
  // confirmed ticket (a changed venue/time invalidates their purchase
  // intent; a lowered capacity could invalidate their spot) — locked once
  // the event has any confirmed ticket (paid or free registration). The
  // client is expected to disable these fields once locked (see
  // ManageEventDetailsSection.tsx), but this is the authoritative check —
  // never trust the client alone (Part 7 of the Unified Event Management
  // spec).
  const participation = await getEventHasConfirmedParticipation(eventId);
  if (participation.status !== 200) {
    return { status: participation.status, message: participation.message };
  }

  if (participation.data) {
    const existingAddress =
      (existingEvent.address as { full_address?: string } | null)
        ?.full_address ?? "";
    const capacityChanged =
      (capacity ?? null) !== (existingEvent.capacity ?? null);
    const addressChanged = address !== existingAddress;
    const datesChanged = haveEventDatesChanged(
      { starts_at: existingEvent.starts_at, ends_at: existingEvent.ends_at },
      existingEvent.event_occurrence ?? [],
      isSpecificEvent ? (specific_dates ?? null) : null,
      isSpecificEvent ? null : (starts_at ?? null),
      isSpecificEvent ? null : (ends_at ?? null),
    );

    if (capacityChanged || addressChanged || datesChanged) {
      return {
        status: 409,
        message:
          "This event already has confirmed tickets — dates, location and capacity can't be changed.",
      };
    }
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

  revalidatePath("/manage/my-events");
  revalidatePath(`/manage/events/${eventId}`);
  revalidatePath("/manage/dashboard");
  // The public event page is ISR-cached (revalidate = 60) and shows the
  // title/description/capacity/schedule/flyer this action just changed —
  // without this it can keep showing pre-edit values for up to a minute.
  // Same reasoning as generateTicket.ts/registerForFreeEvent.ts's identical
  // call for the same route.
  revalidatePath(`/events/${existingEvent.event_code.toLowerCase()}`);

  return { status: 200, message: "Event updated successfully!" };
}

/**
 * Compares the incoming schedule against the event's current schedule,
 * treating a switch between single-date and specific-dates as a change too
 * (not just a difference in the times themselves). Times are compared by
 * value (`getTime()`), not by reference/string, since the DB round-trips
 * dates as ISO strings.
 */
function haveEventDatesChanged(
  existingSingle: { starts_at: string | null; ends_at: string | null },
  existingOccurrences: { starts_at: string; ends_at: string }[],
  incomingSpecificDates: { start: Date; end: Date }[] | null,
  incomingStartsAt: Date | null,
  incomingEndsAt: Date | null,
): boolean {
  const wasSpecific = existingOccurrences.length > 0;
  const isSpecific = incomingSpecificDates !== null;

  if (wasSpecific !== isSpecific) return true;

  if (isSpecific) {
    const incoming = incomingSpecificDates ?? [];
    if (incoming.length !== existingOccurrences.length) return true;

    const toKey = (start: Date | string, end: Date | string) =>
      `${new Date(start).getTime()}_${new Date(end).getTime()}`;

    const existingKeys = new Set(
      existingOccurrences.map((occ) => toKey(occ.starts_at, occ.ends_at)),
    );
    const incomingKeys = new Set(
      incoming.map((entry) => toKey(entry.start, entry.end)),
    );

    if (existingKeys.size !== incomingKeys.size) return true;
    for (const key of incomingKeys) {
      if (!existingKeys.has(key)) return true;
    }
    return false;
  }

  const existingStart = existingSingle.starts_at
    ? new Date(existingSingle.starts_at).getTime()
    : null;
  const existingEnd = existingSingle.ends_at
    ? new Date(existingSingle.ends_at).getTime()
    : null;
  const nextStart = incomingStartsAt ? incomingStartsAt.getTime() : null;
  const nextEnd = incomingEndsAt ? incomingEndsAt.getTime() : null;

  return existingStart !== nextStart || existingEnd !== nextEnd;
}
