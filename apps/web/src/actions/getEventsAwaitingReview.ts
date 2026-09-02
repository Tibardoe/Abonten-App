"use server";

import { createClient } from "@/config/supabase/server";
import { isEventAwaitingReview } from "@abonten/core/eventReviewEligibility";
import { logger } from "@abonten/core/logger";
import type { Occurrence } from "@abonten/types/occurrenceType";

export type EventAwaitingReview = {
  id: string;
  title: string;
  slug: string;
  event_code: string;
  flyer_public_id: string;
  flyer_version: string;
  organizer_id: string;
};

type TicketRow = { ticket_type: { event_id: string } | null };
type EventRow = {
  id: string;
  title: string;
  slug: string;
  event_code: string;
  flyer_public_id: string;
  flyer_version: string;
  organizer_id: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  event_occurrence: Occurrence[] | null;
};

// The "rate your purchase" inbox: every event the user has a checked-in
// ('used') ticket for, has ended, wasn't cancelled, and doesn't already have
// a review from them -- the same three conditions postEventReview.ts/
// getEventReviewEligibility.ts enforce per-event, just applied across all of
// a user's tickets at once. No pagination -- a realistic backlog of
// attended-but-unreviewed events is small, unlike the ticket-history lists.
export async function getEventsAwaitingReview(): Promise<{
  status: number;
  data: EventAwaitingReview[];
  message?: string;
}> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, data: [], message: "User not logged in" };
  }

  const { data: rawTickets, error: ticketsError } = await supabase
    .from("ticket")
    .select("ticket_type:ticket_type_id(event_id)")
    .eq("user_id", user.id)
    .eq("status", "used");

  if (ticketsError) {
    logger.error(`Failed fetching checked-in tickets: ${ticketsError.message}`);
    return { status: 500, data: [], message: "Something went wrong" };
  }

  const eventIds = Array.from(
    new Set(
      (rawTickets as unknown as TicketRow[] | null)
        ?.map((t) => t.ticket_type?.event_id)
        .filter((id): id is string => !!id) ?? [],
    ),
  );

  if (eventIds.length === 0) {
    return { status: 200, data: [] };
  }

  const { data: existingReviews, error: reviewsError } = await supabase
    .from("event_review")
    .select("event_id")
    .eq("reviewer_id", user.id)
    .in("event_id", eventIds);

  if (reviewsError) {
    logger.error(`Failed checking existing reviews: ${reviewsError.message}`);
    return { status: 500, data: [], message: "Something went wrong" };
  }

  const reviewedEventIds = new Set(
    (existingReviews ?? []).map((r) => r.event_id),
  );
  const unreviewedEventIds = eventIds.filter((id) => !reviewedEventIds.has(id));

  if (unreviewedEventIds.length === 0) {
    return { status: 200, data: [] };
  }

  const { data: events, error: eventsError } = await supabase
    .from("event")
    .select(
      "id, title, slug, event_code, flyer_public_id, flyer_version, organizer_id, status, starts_at, ends_at, event_occurrence(id, starts_at, ends_at)",
    )
    .in("id", unreviewedEventIds);

  if (eventsError) {
    logger.error(
      `Failed fetching events awaiting review: ${eventsError.message}`,
    );
    return { status: 500, data: [], message: "Something went wrong" };
  }

  const now = new Date();
  const eligible = ((events as unknown as EventRow[] | null) ?? []).filter(
    (event) =>
      isEventAwaitingReview(
        event.status,
        event.starts_at,
        event.ends_at,
        event.event_occurrence,
        now,
      ),
  );

  return {
    status: 200,
    data: eligible.map((event) => ({
      id: event.id,
      title: event.title,
      slug: event.slug,
      event_code: event.event_code,
      flyer_public_id: event.flyer_public_id,
      flyer_version: event.flyer_version,
      organizer_id: event.organizer_id,
    })),
  };
}
