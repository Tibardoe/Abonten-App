"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";

// Ownership-scoped delete; cascades to event_review_photo via its existing
// FK (event_review_photo_review_id_fkey ... ON DELETE CASCADE).
export const deleteEventReview = withActionLocale(
  async function deleteEventReview(reviewId: string) {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { status: 401, message: tr("userNotAuthenticated") };
    }

    const { data: deleted, error: deleteError } = await supabase
      .from("event_review")
      .delete()
      .eq("id", reviewId)
      .eq("reviewer_id", user.id)
      .select("id");

    if (deleteError) {
      logger.error(`Error deleting event review: ${deleteError.message}`);
      return { status: 500, message: tr("somethingWentWrong") };
    }

    if (!deleted || deleted.length === 0) {
      return { status: 404, message: tr("reviewNotFound") };
    }

    return { status: 200, message: tr("reviewDeletedSuccessfully") };
  },
);
