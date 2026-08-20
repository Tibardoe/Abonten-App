"use server";

import { createClient } from "@/config/supabase/server";

export async function respondToPlaceReview(reviewId: string, response: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  // A place_review row has no owner_id of its own, so ownership (must be
  // the place's owner, not the reviewer) is enforced by joining through to
  // the owning place.
  const { data: review, error: fetchError } = await supabase
    .from("place_review")
    .select("id, place:place_id(owner_id)")
    .eq("id", reviewId)
    .maybeSingle();

  if (fetchError || !review) {
    return { status: 404, message: "Review not found" };
  }

  // biome-ignore lint/suspicious/noExplicitAny: PostgREST's embedded-resource shape isn't worth a dedicated type for this one ownership check; no generated Supabase types exist in this repo (see PROJECT.md)
  const ownerId = (review as any).place?.owner_id;

  if (ownerId !== user.id) {
    return {
      status: 403,
      message: "Not authorized to respond to this review",
    };
  }

  const { error: updateError } = await supabase
    .from("place_review")
    .update({
      owner_response: response,
      owner_response_at: new Date(),
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
