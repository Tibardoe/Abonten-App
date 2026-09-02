import type { Occurrence } from "@abonten/types/occurrenceType";
import { resolveEventEndDate } from "./dateFormatter";

// Single source of truth for "can this viewer review this event" — the state
// machine that both the web `getEventReviewEligibility` Server Action and the
// mobile `useEventReviews` hook run. Each side fetches its own inputs (they
// use different Supabase clients); this only decides. `postEventReview` /
// `postEventReviewCore` re-enforce the same two hard checks (organizer,
// verified attendance) server-side, independent of this.
//
// Order matters: an existing review always wins (`has_review` before
// `cancelled` / `not_ended`) so a review the viewer already left stays
// editable/deletable even if the rules below get stricter later.

export type EventReviewEligibilityReason =
  | "signed_out"
  | "organizer"
  | "has_review"
  | "cancelled"
  | "not_ended"
  | "not_attended";

export type EventReviewEligibilityInput = {
  /** Supabase auth user id, or null when signed out. */
  viewerUserId: string | null;
  organizerId: string;
  /** `event.status` — "canceled" blocks a review. */
  eventStatus: string;
  startsAt: string | null;
  endsAt: string | null;
  occurrences: Occurrence[] | null;
  /** The viewer already has an `event_review` row for this event. */
  hasOwnReview: boolean;
  /** The viewer holds a checked-in ('used') ticket for this event. */
  hasVerifiedAttendance: boolean;
  /** Defaults to `new Date()` — injectable for tests. */
  now?: Date;
};

export type EventReviewEligibility =
  | { canReview: true }
  | { canReview: false; reason: EventReviewEligibilityReason };

export function evaluateEventReviewEligibility(
  input: EventReviewEligibilityInput,
): EventReviewEligibility {
  const now = input.now ?? new Date();

  if (!input.viewerUserId) return { canReview: false, reason: "signed_out" };
  if (input.viewerUserId === input.organizerId) {
    return { canReview: false, reason: "organizer" };
  }
  if (input.hasOwnReview) return { canReview: false, reason: "has_review" };
  if (input.eventStatus === "canceled") {
    return { canReview: false, reason: "cancelled" };
  }

  const endDate = resolveEventEndDate(
    input.startsAt,
    input.endsAt,
    input.occurrences,
  );
  if (!endDate || now < endDate) {
    return { canReview: false, reason: "not_ended" };
  }

  if (!input.hasVerifiedAttendance) {
    return { canReview: false, reason: "not_attended" };
  }

  return { canReview: true };
}

/**
 * The "rate your purchase" inbox filter: an event qualifies once it has
 * ended and was not cancelled. The caller has already narrowed to events the
 * viewer holds a checked-in ticket for and has not yet reviewed.
 */
export function isEventAwaitingReview(
  eventStatus: string,
  startsAt: string | null,
  endsAt: string | null,
  occurrences: Occurrence[] | null,
  now: Date = new Date(),
): boolean {
  if (eventStatus === "canceled") return false;
  const endDate = resolveEventEndDate(startsAt, endsAt, occurrences);
  return endDate ? now >= endDate : false;
}
