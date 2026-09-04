"use server";

import { createClient } from "@/config/supabase/server";
import { createNotificationCore } from "@abonten/services/notifications/createNotification";

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
    .select(
      "id, reviewer_id, event:event_id(id, event_code, organizer_id, title, flyer_public_id, flyer_version)",
    )
    .eq("id", reviewId)
    .maybeSingle();

  if (fetchError || !review) {
    return { status: 404, message: "Review not found" };
  }

  // biome-ignore lint/suspicious/noExplicitAny: PostgREST's embedded-resource shape isn't worth a dedicated type for this one ownership check; no generated Supabase types exist in this repo (see PROJECT.md)
  const typedReview = review as any;
  const event = typedReview.event;

  if (event?.organizer_id !== user.id) {
    return {
      status: 403,
      message: "Not authorized to respond to this review",
    };
  }

  const { error: updateError } = await supabase
    .from("event_review")
    .update({
      organizer_response: response,
      organizer_response_at: new Date().toISOString(),
    })
    .eq("id", reviewId);

  if (updateError) {
    return {
      status: 500,
      message: `Error responding to review: ${updateError.message}`,
    };
  }

  // Tell the reviewer the organizer replied. Best-effort — never fails the
  // reply. Skip self-replies.
  if (typedReview.reviewer_id && typedReview.reviewer_id !== user.id) {
    await createNotificationCore(supabase, {
      userId: typedReview.reviewer_id,
      type: "review_reply",
      title: "The organizer replied to your review",
      body: event?.title
        ? `See the reply on your review of ${event.title}.`
        : "See the reply on your event review.",
      link: event?.event_code
        ? `/events/${String(event.event_code).toLowerCase()}`
        : null,
      data: {
        kind: "review_reply",
        eventId: event?.id,
        reviewId,
      },
      imagePublicId: event?.flyer_public_id ?? null,
      imageVersion: event?.flyer_version ?? null,
    }).catch(() => {});
  }

  return { status: 200, message: "Response posted successfully!" };
}
