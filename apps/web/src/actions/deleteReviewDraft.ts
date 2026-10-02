"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { userFacingError } from "@abonten/core/userFacingError";
import { tr } from "@abonten/services/i18n/requestLocale";

export const deleteReviewDraft = withActionLocale(
  async function deleteReviewDraft(draftId: string) {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      return { status: 500, message: userError.message };
    }
    if (!user) {
      return { status: 401, message: tr("userNotAuthenticated") };
    }

    const { data: draft, error: draftError } = await supabase
      .from("drafts")
      .select("id, user_id")
      .eq("id", draftId)
      .eq("draft_type", "review")
      .maybeSingle();

    if (draftError) {
      return { status: 500, message: draftError.message };
    }
    if (!draft || draft.user_id !== user.id) {
      return { status: 404, message: tr("draftNotFound") };
    }

    const { error: deleteError } = await supabase
      .from("drafts")
      .delete()
      .eq("id", draftId)
      .eq("user_id", user.id);

    if (deleteError) {
      return {
        status: 500,
        message: userFacingError("Failed to delete draft", deleteError),
      };
    }

    return { status: 200, message: tr("draftDeleted") };
  },
);
