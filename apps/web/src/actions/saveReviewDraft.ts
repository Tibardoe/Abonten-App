"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { userFacingError } from "@abonten/core/userFacingError";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type ReviewDraftPayload,
  reviewDraftPayloadSchema,
} from "@abonten/validation/reviewDraftSchema";

type SaveReviewDraftInput = {
  draftId?: string;
  payload: ReviewDraftPayload;
  expectedUpdatedAt?: string;
};

export const saveReviewDraft = withActionLocale(async function saveReviewDraft({
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
      message: userFacingError("Error fetching user", userError),
    };
  }
  if (!user) {
    return { status: 401, message: tr("userNotAuthenticated") };
  }

  const parsed = reviewDraftPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: 400, message: tr("invalidDraftData") };
  }

  if (parsed.data.reviewedId === user.id) {
    return { status: 400, message: tr("youCannotReviewYourself") };
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
        message: userFacingError("Error loading draft", existingDraftError),
      };
    }
    if (!existingDraft || existingDraft.user_id !== user.id) {
      return { status: 404, message: tr("draftNotFound") };
    }
    if (expectedUpdatedAt && existingDraft.updated_at !== expectedUpdatedAt) {
      return {
        status: 409,
        message: tr("thisDraftWasUpdatedElsewhereReload"),
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
      ? tr("reviewOf", { username: reviewedUser.username })
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
        message: userFacingError("Failed to save draft", updateDraftError),
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
        message: userFacingError(
          "Failed to save draft",
          updateReviewDraftError,
        ),
      };
    }

    const { data: refreshedDraft } = await supabase
      .from("drafts")
      .select("updated_at")
      .eq("id", draftId)
      .single();

    return {
      status: 200,
      message: tr("draftSaved"),
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
      message: tr("failedToSaveDraft", {
        value: insertDraftError?.message ?? tr("unknownError"),
      }),
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
      message: userFacingError("Failed to save draft", insertReviewDraftError),
    };
  }

  return {
    status: 200,
    message: tr("draftSaved"),
    data: { draftId: newDraft.id, updatedAt: newDraft.updated_at },
  };
});
