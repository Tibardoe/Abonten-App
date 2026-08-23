"use server";

import { createClient } from "@/config/supabase/server";

export type MyEventsTabCounts = {
  active: number;
  cancelled: number;
  refunds: number;
  reviewed: number;
  reviewedPlaces: number;
};

/**
 * Cheap counts for the tab badges — `head:true` exact counts (index-backed
 * on ticket.user_id/status and event_review/place_review.reviewer_id),
 * never a full row fetch just to size a badge. The "Reviewed" tab's badge is
 * `reviewed + reviewedPlaces` combined (see MyEventsTabs.tsx) since it's one
 * outer tab with an Events/Places split inside it. "To Review" has no entry
 * here — it shares getEventsAwaitingReview.ts's own query result for its
 * badge instead, since sizing it requires the same per-event date/status
 * resolution as fetching the list.
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
    return {
      status: 500,
      data: {
        active: 0,
        cancelled: 0,
        refunds: 0,
        reviewed: 0,
        reviewedPlaces: 0,
      },
      message: "User not logged in",
    };
  }

  const [
    activeResult,
    cancelledResult,
    refundsResult,
    reviewedResult,
    reviewedPlacesResult,
  ] = await Promise.all([
    supabase
      .from("ticket")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      // Matches getUserAttendingEvents.ts's "active" tab definition --
      // 'used' (checked in) still counts as an active, non-cancelled ticket.
      .in("status", ["active", "used"]),
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
    activeResult.error ||
    cancelledResult.error ||
    refundsResult.error ||
    reviewedResult.error ||
    reviewedPlacesResult.error
  ) {
    console.error(
      `Failed fetching My Events tab counts: ${
        activeResult.error?.message ??
        cancelledResult.error?.message ??
        refundsResult.error?.message ??
        reviewedResult.error?.message ??
        reviewedPlacesResult.error?.message
      }`,
    );

    return {
      status: 500,
      data: {
        active: 0,
        cancelled: 0,
        refunds: 0,
        reviewed: 0,
        reviewedPlaces: 0,
      },
      message: "Something went wrong",
    };
  }

  return {
    status: 200,
    data: {
      active: activeResult.count ?? 0,
      cancelled: cancelledResult.count ?? 0,
      refunds: refundsResult.count ?? 0,
      reviewed: reviewedResult.count ?? 0,
      reviewedPlaces: reviewedPlacesResult.count ?? 0,
    },
  };
}
