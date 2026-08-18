"use server";

import { createClient } from "@/config/supabase/server";

export type ReviewDraftDetail = {
  id: string;
  updatedAt: string;
  expiresAt: string;
  reviewedId: string;
  reviewedUsername: string | null;
  title: string | null;
  comment: string | null;
  rating: number | null;
  // Set when the draft can no longer be submitted (target no longer
  // eligible, already reviewed, etc.) — the caller should surface this
  // instead of silently letting a stale draft through to submission.
  ineligibleReason: string | null;
};

// Full fetch for "Continue". Re-runs the same eligibility checks
// postReview.ts enforces at submit time, because attendance/review state
// can change between when a review draft was saved and when it's resumed.
export async function getReviewDraft(draftId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return { status: 500, message: userError.message, data: null };
  }
  if (!user) {
    return { status: 401, message: "User not authenticated", data: null };
  }

  const { data: draft, error: draftError } = await supabase
    .from("drafts")
    .select("id, user_id, updated_at, expires_at")
    .eq("id", draftId)
    .eq("draft_type", "review")
    .maybeSingle();

  if (draftError) {
    return { status: 500, message: draftError.message, data: null };
  }
  if (!draft || draft.user_id !== user.id) {
    return { status: 404, message: "Draft not found.", data: null };
  }
  if (new Date(draft.expires_at) <= new Date()) {
    return { status: 410, message: "This draft has expired.", data: null };
  }

  const { data: reviewDraft, error: reviewDraftError } = await supabase
    .from("review_drafts")
    .select("reviewed_id, title, comment, rating")
    .eq("draft_id", draftId)
    .maybeSingle();

  if (reviewDraftError || !reviewDraft) {
    return {
      status: 500,
      message: reviewDraftError?.message ?? "Draft data not found.",
      data: null,
    };
  }

  const { data: reviewedUser } = await supabase
    .from("user_info")
    .select("username")
    .eq("id", reviewDraft.reviewed_id)
    .maybeSingle();

  let ineligibleReason: string | null = null;

  const { data: reviewedEvents, error: reviewedEventsError } = await supabase
    .from("event")
    .select("id")
    .eq("organizer_id", reviewDraft.reviewed_id);

  if (reviewedEventsError) {
    ineligibleReason = "Could not verify this draft's eligibility right now.";
  } else {
    const reviewedEventIds = (reviewedEvents ?? []).map((e) => e.id);
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
      ineligibleReason =
        "You can only review organizers of events you've attended.";
    } else {
      const { count: existingReviewCount } = await supabase
        .from("review")
        .select("id", { count: "exact", head: true })
        .eq("reviewer_id", user.id)
        .eq("reviewed_id", reviewDraft.reviewed_id);

      if ((existingReviewCount ?? 0) > 0) {
        ineligibleReason = "You've already reviewed this organizer.";
      }
    }
  }

  const detail: ReviewDraftDetail = {
    id: draft.id,
    updatedAt: draft.updated_at,
    expiresAt: draft.expires_at,
    reviewedId: reviewDraft.reviewed_id,
    reviewedUsername: reviewedUser?.username ?? null,
    title: reviewDraft.title,
    comment: reviewDraft.comment,
    rating: reviewDraft.rating,
    ineligibleReason,
  };

  return { status: 200, message: "OK", data: detail };
}
