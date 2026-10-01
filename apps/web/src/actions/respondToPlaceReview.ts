"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import { tr } from "@abonten/services/i18n/requestLocale";
import { respondToPlaceReviewCore } from "@abonten/services/reviews/reviewResponseCore";

/**
 * Owner reply to a place review — create OR edit (the core detects which
 * from whether a reply already exists). Thin wrapper: auth here, the
 * join-through-to-place ownership check + validation + update in
 * respondToPlaceReviewCore (shared with /api/mobile).
 */
export const respondToPlaceReview = withActionLocale(
  async function respondToPlaceReview(reviewId: string, response: string) {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        status: 401 as const,
        message: tr("userNotAuthenticated"),
      };
    }

    const result = await respondToPlaceReviewCore(
      supabase,
      user.id,
      reviewId,
      response,
    );

    if (result.status === 200 && result.data?.placeSlug) {
      revalidateAppPath(`/places/${result.data.placeSlug}`);
    }

    return result;
  },
);
