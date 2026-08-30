"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";

type FormDataType = {
  title: string;
  review: string;
  rating: number;
  reviewedId: string;
  // The draft this review is being submitted from, if any. Deleted only
  // after the insert below succeeds — a failed submission leaves the
  // draft intact so the written review text is never lost.
  draftId?: string;
};

export async function postReview(formData: FormDataType) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message}`,
    };
  }

  if (!user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: userDetails, error: userDetailsError } = await supabase
    .from("user_info")
    .select("*")
    .eq("id", user.id)
    .single();

  if (userDetailsError) {
    return {
      status: 500,
      message: `Error fetching user details: ${userDetailsError.message}`,
    };
  }

  if (!userDetails) {
    return { status: 401, message: "User not found" };
  }

  const { title, review, rating, reviewedId, draftId } = formData;

  if (reviewedId === user.id) {
    return { status: 400, message: "You cannot review yourself" };
  }

  // Reviews are of organizers — only someone who actually attended one of
  // this person's events may leave one, so a direct call can't be used to
  // review a stranger with no real interaction.
  const { data: reviewedEvents, error: reviewedEventsError } = await supabase
    .from("event")
    .select("id")
    .eq("organizer_id", reviewedId);

  if (reviewedEventsError) {
    return {
      status: 500,
      message: `Error fetching organizer events: ${reviewedEventsError.message}`,
    };
  }

  const reviewedEventIds = (reviewedEvents ?? []).map((event) => event.id);

  let hasAttended = false;

  if (reviewedEventIds.length > 0) {
    const { count } = await supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("event_id", reviewedEventIds);

    hasAttended = (count ?? 0) > 0;
  }

  if (!hasAttended) {
    return {
      status: 403,
      message: "You can only review organizers of events you've attended",
    };
  }

  const formattedTitle = title
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  const { error: insertEror } = await supabase.from("review").insert({
    created_at: new Date(),
    title: formattedTitle,
    comment: review,
    rating: rating,
    reviewer_id: userDetails.id,
    reviewed_id: reviewedId,
    status: "approved",
  });

  if (insertEror) {
    logger.error(`Error inserting review: ${insertEror.message}`);

    return { status: 500, message: "Something went wrong!" };
  }

  // Only remove the source draft after the review has actually been
  // created. Best-effort: a failure here doesn't affect the result the
  // user sees, and a stray draft just expires naturally in 48h.
  if (draftId) {
    const { error: deleteDraftError } = await supabase
      .from("drafts")
      .delete()
      .eq("id", draftId)
      .eq("user_id", user.id);

    if (deleteDraftError) {
      logger.error(
        `Failed to delete draft ${draftId} after successful review submission: ${deleteDraftError.message}`,
      );
    }
  }

  return { status: 200, message: "Review posted successfully!" };
}
