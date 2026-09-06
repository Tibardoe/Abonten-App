"use server";

import { createClient } from "@/config/supabase/server";
import { deleteEventReviewResponseCore } from "@abonten/services/reviews/reviewResponseCore";
import { revalidatePath } from "next/cache";

/**
 * Organizer-only removal of their reply to an event review. Thin wrapper:
 * auth here, ownership check + null-out in deleteEventReviewResponseCore
 * (shared with /api/mobile). Idempotent.
 */
export async function deleteEventReviewResponse(reviewId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const result = await deleteEventReviewResponseCore(
    supabase,
    user.id,
    reviewId,
  );

  if (result.status === 200 && result.data?.eventCode) {
    revalidatePath(`/events/${result.data.eventCode.toLowerCase()}`);
  }

  return result;
}
