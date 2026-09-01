import { logger } from "@abonten/core/logger";
import { validateLocationInput } from "@abonten/core/validateLocationInput";
import type { SupabaseClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";
import { getEventHasConfirmedParticipationCore } from "./getEventHasConfirmedParticipationCore";

// Post-auth, post-flyer-upload body of updateEvent, lifted so the
// PATCH /api/mobile/organizer/events/:id route runs the exact same edit flow
// as the web Server Action. The one platform difference — how a replacement
// flyer's bytes reach Cloudinary (web: a File uploaded server-side by
// saveEventFlyerToCloudinary; mobile: a signed direct upload from the
// device) — is resolved by the caller, which hands this an already-uploaded
// `flyerPublicId` / `flyerVersion` (both omitted = keep the current flyer).
// The `revalidatePath` calls stay in the thin web action (this file is
// deliberately NOT "use server"); the core returns `eventCode` for them.
//
// Deliberately does NOT touch ticket_type / promo_code / receiving_account —
// see updateEventTicketTypesCore for the separate, lock-gated ticket editor.

type DateInput = string | Date;

export type UpdateEventCoreInput = {
  eventId: string;
  title: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  capacity?: number | null;
  website_url?: string | null;
  category: string;
  types: string[];
  checked: boolean;
  starts_at?: DateInput | null;
  ends_at?: DateInput | null;
  specific_dates?: { start: DateInput; end: DateInput }[] | null;
  flyerPublicId?: string | null;
  flyerVersion?: string | null;
};

export type UpdateEventCoreResult =
  | { status: 400 | 404 | 409 | 500; message: string }
  | { status: 200; message: string; eventCode: string };

export async function updateEventCore(
  supabase: SupabaseClient,
  userId: string,
  input: UpdateEventCoreInput,
): Promise<UpdateEventCoreResult> {
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
    flyerPublicId,
    flyerVersion,
  } = input;

  const locationCheck = validateLocationInput({ address, latitude, longitude });
  if (!locationCheck.valid) {
    return { status: 400, message: locationCheck.message };
  }

  const isSpecificEvent = !!specific_dates && specific_dates.length > 0;

  // Ownership-scoped fetch first — also gives us the current flyer (only
  // touch Cloudinary when a replacement was supplied) and the current
  // schedule/location/capacity, used below to detect an attempted change to
  // a locked field once the event has confirmed tickets.
  const { data: existingEvent, error: fetchError } = await supabase
    .from("event")
    .select(
      "flyer_public_id, flyer_version, starts_at, ends_at, address, capacity, event_code, event_occurrence(starts_at, ends_at)",
    )
    .eq("id", eventId)
    .eq("organizer_id", userId)
    .single();

  if (fetchError || !existingEvent) {
    return { status: 404, message: "Event not found or unauthorized" };
  }

  // Dates, location and capacity could affect people who already hold a
  // confirmed ticket — locked once the event has any confirmed ticket (paid
  // or free registration). The client disables these fields once locked, but
  // this is the authoritative check (Part 7 of the Unified Event Management
  // spec).
  const participation = await getEventHasConfirmedParticipationCore(
    supabase,
    userId,
    eventId,
  );
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

  let nextFlyerPublicId = existingEvent.flyer_public_id;
  let nextFlyerVersion = existingEvent.flyer_version;
  let previousFlyerPublicId: string | null = null;

  if (flyerPublicId && flyerVersion) {
    previousFlyerPublicId = nextFlyerPublicId;
    nextFlyerPublicId = flyerPublicId;
    nextFlyerVersion = flyerVersion;
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
      flyer_public_id: nextFlyerPublicId,
      flyer_version: nextFlyerVersion,
    })
    .eq("id", eventId)
    .eq("organizer_id", userId);

  if (updateError) {
    return {
      status: 500,
      message: `Error updating event: ${updateError.message}`,
    };
  }

  // Replace the schedule wholesale: no other table has an FK to
  // event_occurrence.id (tickets/attendance are keyed by event_id), so a
  // full delete + reinsert is safe — same approach postEventCore uses.
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
      logger.error("Cloudinary deletion of old flyer failed:", cloudError);
      // Not failing the whole update if cleanup of the old flyer fails.
    }
  }

  return {
    status: 200,
    message: "Event updated successfully!",
    eventCode: existingEvent.event_code as string,
  };
}

/**
 * Compares the incoming schedule against the event's current schedule,
 * treating a switch between single-date and specific-dates as a change too.
 * Times are compared by value (`getTime()`), since the DB round-trips dates
 * as ISO strings.
 */
function haveEventDatesChanged(
  existingSingle: { starts_at: string | null; ends_at: string | null },
  existingOccurrences: { starts_at: string; ends_at: string }[],
  incomingSpecificDates: { start: DateInput; end: DateInput }[] | null,
  incomingStartsAt: DateInput | null,
  incomingEndsAt: DateInput | null,
): boolean {
  const wasSpecific = existingOccurrences.length > 0;
  const isSpecific = incomingSpecificDates !== null;

  if (wasSpecific !== isSpecific) return true;

  if (isSpecific) {
    const incoming = incomingSpecificDates ?? [];
    if (incoming.length !== existingOccurrences.length) return true;

    const toKey = (start: DateInput, end: DateInput) =>
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
  const nextStart = incomingStartsAt
    ? new Date(incomingStartsAt).getTime()
    : null;
  const nextEnd = incomingEndsAt ? new Date(incomingEndsAt).getTime() : null;

  return existingStart !== nextStart || existingEnd !== nextEnd;
}
