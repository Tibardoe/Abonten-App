"use server";

import { createClient } from "@/config/supabase/server";

// Whether the current user has already reviewed this place, and the review
// itself if so -- lets AddPlaceReviewButton.tsx switch between "Add Review"
// and "Your Review" (Edit/Delete) instead of only discovering a duplicate
// on submit (postPlaceReview.ts's 409). Places have no attendance/timing
// gate the way events do, so this is a plain existence check, not a full
// eligibility computation like getEventReviewEligibility.ts.
export async function getOwnPlaceReview(placeId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("place_review")
    .select("id, rating, title, comment")
    .eq("place_id", placeId)
    .eq("reviewer_id", user.id)
    .maybeSingle();

  return data;
}
