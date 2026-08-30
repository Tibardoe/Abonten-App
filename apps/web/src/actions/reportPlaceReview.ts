"use server";

import { createClient } from "@/config/supabase/server";

export async function reportPlaceReview(reviewId: string, reason: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { error: insertError } = await supabase.from("place_report").insert({
    review_id: reviewId,
    reporter_id: user.id,
    reason,
    status: "pending",
  });

  if (insertError) {
    return {
      status: 500,
      message: `Error reporting review: ${insertError.message}`,
    };
  }

  return { status: 200, message: "Report submitted. Thank you." };
}
