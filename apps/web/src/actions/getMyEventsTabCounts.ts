"use server";

import { createClient } from "@/config/supabase/server";
import { getEventStatus } from "@abonten/core/eventStatus";
import { logger } from "@abonten/core/logger";

export type MyEventsTabCounts = {
  active: number;
  past: number;
  cancelled: number;
  refunds: number;
  reviewed: number;
  reviewedPlaces: number;
};

const EMPTY_COUNTS: MyEventsTabCounts = {
  active: 0,
  past: 0,
  cancelled: 0,
  refunds: 0,
  reviewed: 0,
  reviewedPlaces: 0,
};

// Skinny shape of a held ticket -- just enough of the joined event to decide
// whether the ticket is for something still upcoming ("active") or already
// over/called off ("past").
type HeldTicketRow = {
  ticket_type: {
    event: {
      status: string | null;
      starts_at: string | null;
      ends_at: string | null;
      occurrences: { id: string; starts_at: string; ends_at: string }[] | null;
    } | null;
  } | null;
};

/**
 * Cheap counts for the tab badges. Most are `head:true` exact counts
 * (index-backed on ticket.user_id/status and
 * event_review/place_review.reviewer_id). The active/past split is the
 * exception: it depends on each event's live lifecycle (ended? cancelled?),
 * which isn't a column, so it's a single skinny row fetch of the user's held
 * tickets partitioned in JS. The "Reviewed" tab's badge is
 * `reviewed + reviewedPlaces` combined (see MyEventsTabs.tsx) since it's one
 * outer tab with an Events/Places split inside it. "To Review" has no entry
 * here -- it shares getEventsAwaitingReview.ts's own query result for its
 * badge instead.
 */
export default async function getMyEventsTabCounts(): Promise<{
  status: number;
  data: MyEventsTabCounts;
  message?: string;
}> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 500, data: EMPTY_COUNTS, message: "User not logged in" };
  }

  const [
    heldTicketsResult,
    cancelledResult,
    refundsResult,
    reviewedResult,
    reviewedPlacesResult,
  ] = await Promise.all([
    // Held tickets (active + checked-in), with just the event fields needed
    // to split active vs past. Capped high enough that no real attendee hits
    // it; a truncated count is still a sane badge if one somehow does.
    supabase
      .from("ticket")
      .select(
        `ticket_type:ticket_type_id (
          event:event_id (
            status, starts_at, ends_at,
            occurrences:event_occurrence ( id, starts_at, ends_at )
          )
        )`,
      )
      .eq("user_id", user.id)
      .in("status", ["active", "used"])
      .limit(2000),
    supabase
      .from("ticket")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "cancelled"),
    supabase
      .from("ticket")
      .select("id, transaction:transaction_id!inner(amount)", {
        count: "exact",
        head: true,
      })
      .eq("user_id", user.id)
      .eq("status", "cancelled")
      .gt("transaction.amount", 0),
    supabase
      .from("event_review")
      .select("id", { count: "exact", head: true })
      .eq("reviewer_id", user.id),
    supabase
      .from("place_review")
      .select("id", { count: "exact", head: true })
      .eq("reviewer_id", user.id),
  ]);

  if (
    heldTicketsResult.error ||
    cancelledResult.error ||
    refundsResult.error ||
    reviewedResult.error ||
    reviewedPlacesResult.error
  ) {
    logger.error(
      `Failed fetching My Events tab counts: ${
        heldTicketsResult.error?.message ??
        cancelledResult.error?.message ??
        refundsResult.error?.message ??
        reviewedResult.error?.message ??
        reviewedPlacesResult.error?.message
      }`,
    );

    return { status: 500, data: EMPTY_COUNTS, message: "Something went wrong" };
  }

  let active = 0;
  let past = 0;
  for (const row of (heldTicketsResult.data ??
    []) as unknown as HeldTicketRow[]) {
    const event = row.ticket_type?.event;
    const isPast =
      !!event &&
      (event.status === "canceled" ||
        getEventStatus(event.starts_at, event.ends_at, event.occurrences) ===
          "ended");
    if (isPast) past += 1;
    else active += 1;
  }

  return {
    status: 200,
    data: {
      active,
      past,
      cancelled: cancelledResult.count ?? 0,
      refunds: refundsResult.count ?? 0,
      reviewed: reviewedResult.count ?? 0,
      reviewedPlaces: reviewedPlacesResult.count ?? 0,
    },
  };
}
