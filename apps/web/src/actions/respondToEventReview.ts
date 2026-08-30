"use server";

import { createClient } from "@/config/supabase/server";

// Organizer counterpart to respondToPlaceReview.ts. An event_review row has
// no organizer_id of its own, so ownership (must be the event's organizer,
// not the reviewer) is enforced by joining through to the owning event --
// same pattern, same reason.
export async function respondToEventReview(reviewId: string, response: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: review, error: fetchError } = await supabase
    .from("event_review")
    .select("id, event:event_id(organizer_id)")
    .eq("id", reviewId)
    .maybeSingle();

  if (fetchError || !review) {
    return { status: 404, message: "Review not found" };
  }

  // biome-ignore lint/suspicious/noExplicitAny: PostgREST's embedded-resource shape isn't worth a dedicated type for this one ownership check; no generated Supabase types exist in this repo (see PROJECT.md)
  const organizerId = (review as any).event?.organizer_id;

  if (organizerId !== user.id) {
    return {
      status: 403,
      message: "Not authorized to respond to this review",
    };
  }

  const { error: updateError } = await supabase
    .from("event_review")
    .update({
      organizer_response: response,
      organizer_response_at: new Date(),
    })
    .eq("id", reviewId);

  if (updateError) {
    return {
      status: 500,
      message: `Error responding to review: ${updateError.message}`,
    };
  }

  return { status: 200, message: "Response posted successfully!" };
}
