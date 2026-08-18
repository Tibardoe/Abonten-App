"use server";

import { createClient } from "@/config/supabase/server";
import {
  type ReviewDraftPayload,
  reviewDraftPayloadSchema,
} from "@/utils/reviewDraftSchema";

type SaveReviewDraftInput = {
  draftId?: string;
  payload: ReviewDraftPayload;
  expectedUpdatedAt?: string;
};

export async function saveReviewDraft({
  draftId,
  payload,
  expectedUpdatedAt,
}: SaveReviewDraftInput) {
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

  const parsed = reviewDraftPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: 400, message: "Invalid draft data." };
  }

  if (parsed.data.reviewedId === user.id) {
    return { status: 400, message: "You cannot review yourself" };
  }

  if (draftId) {
    const { data: existingDraft, error: existingDraftError } = await supabase
      .from("drafts")
      .select("id, user_id, updated_at")
      .eq("id", draftId)
      .eq("draft_type", "review")
      .maybeSingle();

    if (existingDraftError) {
      return {
        status: 500,
        message: `Error loading draft: ${existingDraftError.message}`,
      };
    }
    if (!existingDraft || existingDraft.user_id !== user.id) {
      return { status: 404, message: "Draft not found." };
    }
    if (expectedUpdatedAt && existingDraft.updated_at !== expectedUpdatedAt) {
      return {
        status: 409,
        message:
          "This draft was updated elsewhere — reload to see the latest version.",
      };
    }
  }

  // Label shown on the drafts list — the review's own title if the user's
  // written one, otherwise a fallback naming who it's about.
  let title = parsed.data.title?.trim() || null;
  if (!title) {
    const { data: reviewedUser } = await supabase
      .from("user_info")
      .select("username")
      .eq("id", parsed.data.reviewedId)
      .maybeSingle();
    title = reviewedUser?.username
      ? `Review of ${reviewedUser.username}`
      : null;
  }

  if (draftId) {
    const { error: updateDraftError } = await supabase
      .from("drafts")
      .update({ title })
      .eq("id", draftId)
      .eq("user_id", user.id);

    if (updateDraftError) {
      return {
        status: 500,
        message: `Failed to save draft: ${updateDraftError.message}`,
      };
    }

    const { error: updateReviewDraftError } = await supabase
      .from("review_drafts")
      .update({
        reviewed_id: parsed.data.reviewedId,
        title: parsed.data.title ?? null,
        comment: parsed.data.comment ?? null,
        rating: parsed.data.rating ?? null,
      })
      .eq("draft_id", draftId);

    if (updateReviewDraftError) {
      return {
        status: 500,
        message: `Failed to save draft: ${updateReviewDraftError.message}`,
      };
    }

    const { data: refreshedDraft } = await supabase
      .from("drafts")
      .select("updated_at")
      .eq("id", draftId)
      .single();

    return {
      status: 200,
      message: "Draft saved.",
      data: { draftId, updatedAt: refreshedDraft?.updated_at },
    };
  }

  const { data: newDraft, error: insertDraftError } = await supabase
    .from("drafts")
    .insert({ user_id: user.id, draft_type: "review", title })
    .select("id, updated_at")
    .single();

  if (insertDraftError || !newDraft) {
    return {
      status: 500,
      message: `Failed to save draft: ${insertDraftError?.message ?? "unknown error"}`,
    };
  }

  const { error: insertReviewDraftError } = await supabase
    .from("review_drafts")
    .insert({
      draft_id: newDraft.id,
      reviewed_id: parsed.data.reviewedId,
      title: parsed.data.title ?? null,
      comment: parsed.data.comment ?? null,
      rating: parsed.data.rating ?? null,
    });

  if (insertReviewDraftError) {
    await supabase.from("drafts").delete().eq("id", newDraft.id);
    return {
      status: 500,
      message: `Failed to save draft: ${insertReviewDraftError.message}`,
    };
  }

  return {
    status: 200,
    message: "Draft saved.",
    data: { draftId: newDraft.id, updatedAt: newDraft.updated_at },
  };
}
