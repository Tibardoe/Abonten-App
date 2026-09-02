"use server";

import { createClient } from "@/config/supabase/server";
import { resolveEventEndDate } from "@abonten/core/dateFormatter";
import { logger } from "@abonten/core/logger";
import {
  type ReviewPhotoInput,
  insertReviewPhotos,
} from "@abonten/services/reviews/insertReviewPhotos";
import type { Occurrence } from "@abonten/types/occurrenceType";

// Postgres error code for a unique-constraint violation.
const UNIQUE_VIOLATION = "23505";

type PostEventReviewInput = {
  eventId: string;
  rating: number;
  title?: string;
  comment?: string;
  photos?: ReviewPhotoInput[];
};

type TicketRow = { ticket_type: { event_id: string } | null };

/**
 * Reviews of a specific event (event_review), distinct from the older
 * generic `review` table (postReview.ts), which reviews an organizer as a
 * person across all of their events. Unlike postPlaceReview.ts (any
 * authenticated user may review any published place), this keeps an
 * attendance gate -- only someone who actually attended THIS event may
 * review it, scoped to event_id instead of "any event by this organizer".
 * The DB's UNIQUE(event_id, reviewer_id) constraint
 * (event_review_unique_reviewer) enforces "one review per user per event".
 *
 * "Attended" here means a checked-in ('used') ticket, not merely a
 * purchased/RSVP'd one -- a ticket only reaches 'used' via checkInTicket.ts,
 * an organizer-confirmed action. This, plus the event-ended check below,
 * mirrors getEventReviewEligibility.ts's rules exactly so a direct call to
 * this action can't bypass what the UI already enforces.
 */
export async function postEventReview(formData: PostEventReviewInput) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message}`,
    };
  }

  if (!user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { eventId, rating, title, comment, photos } = formData;

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select(
      "organizer_id, status, starts_at, ends_at, event_occurrence(id, starts_at, ends_at)",
    )
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    return {
      status: 500,
      message: `Error fetching event: ${eventError.message}`,
    };
  }

  if (!event) {
    return { status: 404, message: "Event not found" };
  }

  if (event.organizer_id === user.id) {
    return { status: 400, message: "You cannot review your own event" };
  }

  if (event.status === "canceled") {
    return { status: 400, message: "This event was cancelled." };
  }

  const endDate = resolveEventEndDate(
    event.starts_at,
    event.ends_at,
    event.event_occurrence as Occurrence[] | null,
  );

  if (!endDate || new Date() < endDate) {
    return {
      status: 403,
      message: "You can only review this event after it has ended.",
    };
  }

  const { data: rawTickets, error: ticketsError } = await supabase
    .from("ticket")
    .select("ticket_type:ticket_type_id(event_id)")
    .eq("user_id", user.id)
    .eq("status", "used");

  if (ticketsError) {
    return {
      status: 500,
      message: `Error checking attendance: ${ticketsError.message}`,
    };
  }

  const hasVerifiedTicket = (rawTickets as unknown as TicketRow[] | null)?.some(
    (t) => t.ticket_type?.event_id === eventId,
  );

  if (!hasVerifiedTicket) {
    return {
      status: 403,
      message: "You can only review events you've attended",
    };
  }

  const formattedTitle = title
    ? title
        .split(" ")
        .map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
        )
        .join(" ")
    : null;

  const { data: review, error: insertError } = await supabase
    .from("event_review")
    .insert({
      event_id: eventId,
      reviewer_id: user.id,
      rating,
      title: formattedTitle,
      comment: comment ?? null,
      status: "approved",
      is_verified_attendee: true,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) {
      return { status: 409, message: "You've already reviewed this event." };
    }

    logger.error(`Error inserting event review: ${insertError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  await insertReviewPhotos(
    supabase,
    "event_review_photo",
    "event_review_id",
    review.id,
    `event_review_photos/${user.id}/`,
    photos,
  );

  return { status: 200, message: "Review posted successfully!" };
}
