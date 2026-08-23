"use server";

import { createClient } from "@/config/supabase/server";
import type { Occurrence } from "@/types/occurrenceType";
import { resolveEventEndDate } from "@/utils/dateFormatter";

export type EventReviewEligibility =
  | {
      canReview: false;
      reason:
        | "signed_out"
        | "organizer"
        | "cancelled"
        | "not_ended"
        | "not_attended";
    }
  | {
      canReview: false;
      reason: "has_review";
      ownReview: {
        id: string;
        rating: number;
        title: string | null;
        comment: string | null;
        event_review_photo: {
          id: string;
          public_id: string;
          version: string;
          position: number;
        }[];
      };
    }
  | { canReview: true };

type TicketRow = { ticket_type: { event_id: string } | null };

// Computed once per Event Details page render, fed the event fields the page
// already fetched (no re-query of `event` itself) so this only adds the
// per-viewer lookups: the caller's own event_review row (if any -- always
// wins, since an existing review must stay editable/deletable even if the
// rules below get stricter later) and, failing that, whether they hold a
// checked-in ('used') ticket for this event. A checked-in ticket -- set by
// checkInTicket.ts -- is the actual "verified attendance" signal; a
// purchased/RSVP'd-but-never-checked-in ticket does not count. postEventReview.ts
// re-enforces the same two checks server-side, independent of this action.
export async function getEventReviewEligibility(
  eventId: string,
  organizerId: string,
  eventStatus: string,
  startsAt: string | null,
  endsAt: string | null,
  occurrences: Occurrence[] | null,
): Promise<EventReviewEligibility> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { canReview: false, reason: "signed_out" };
  if (user.id === organizerId) return { canReview: false, reason: "organizer" };

  const { data: ownReview } = await supabase
    .from("event_review")
    .select(
      "id, rating, title, comment, event_review_photo(id, public_id, version, position)",
    )
    .eq("event_id", eventId)
    .eq("reviewer_id", user.id)
    .maybeSingle();

  if (ownReview) {
    return {
      canReview: false,
      reason: "has_review",
      ownReview: ownReview as unknown as Extract<
        EventReviewEligibility,
        { reason: "has_review" }
      >["ownReview"],
    };
  }

  if (eventStatus === "canceled") {
    return { canReview: false, reason: "cancelled" };
  }

  const endDate = resolveEventEndDate(startsAt, endsAt, occurrences);
  if (!endDate || new Date() < endDate) {
    return { canReview: false, reason: "not_ended" };
  }

  const { data: rawTickets, error: ticketsError } = await supabase
    .from("ticket")
    .select("ticket_type:ticket_type_id(event_id)")
    .eq("user_id", user.id)
    .eq("status", "used");

  if (ticketsError) {
    console.log(`Failed checking verified attendance: ${ticketsError.message}`);
    return { canReview: false, reason: "not_attended" };
  }

  const hasVerifiedTicket = (rawTickets as unknown as TicketRow[] | null)?.some(
    (t) => t.ticket_type?.event_id === eventId,
  );

  if (!hasVerifiedTicket) {
    return { canReview: false, reason: "not_attended" };
  }

  return { canReview: true };
}
