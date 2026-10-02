"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@abonten/core/pagination";
import { tr } from "@abonten/services/i18n/requestLocale";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { OwnedPlaceReviewListItem } from "@abonten/types/reviewType";

// Reviews of places this user owns/manages — the place-side counterpart to
// getUserReviews.ts (which shows reviews written ABOUT this user as an
// event organizer). place_review has no "reviewed person" column the way
// `review` has `reviewed_id` (a review is about a place, not a person), so
// this filters by joining to `place` and matching its owner_id instead —
// the `place:place_id!inner(...)` embed + `.eq("place.owner_id", ...)`
// pattern already used by getMyEventsTabCounts.ts/getUserTicketRefunds.ts.
export const getOwnedPlaceReviews = withActionLocale(
  async function getOwnedPlaceReviews(
    username: string,
    options?: { cursor?: string | null; pageSize?: number },
  ): Promise<PaginatedResult<OwnedPlaceReviewListItem>> {
    const supabase = await createClient();
    const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
    const cursor = decodeCursor<SimpleCursor>(options?.cursor);

    const { data: user, error: userError } = await supabase
      .from("user_info")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (!user || userError) {
      logger.error(`Error fetching user id: ${userError?.message}`);

      return {
        status: 500,
        data: [],
        nextCursor: null,
        hasNextPage: false,
        message: tr("somethingWentWrong"),
      };
    }

    let query = supabase
      .from("place_review")
      .select(
        "*, user_info:reviewer_id(username, avatar_public_id, avatar_version), place:place_id!inner(name, slug, owner_id), place_review_photo(id, public_id, version, position)",
      )
      .eq("place.owner_id", user.id)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(pageSize + 1);

    if (cursor) {
      query = query.or(keysetOlderThan("created_at", "id", cursor));
    }

    const { data, error } = await query;

    if (error) {
      logger.error(`Failed fetching owned-place reviews: ${error.message}`);

      return {
        status: 500,
        data: [],
        nextCursor: null,
        hasNextPage: false,
        message: tr("somethingWentWrong"),
      };
    }

    const { page, hasNextPage } = splitPage<OwnedPlaceReviewListItem>(
      data ?? [],
      pageSize,
    );

    const last = page[page.length - 1];
    const nextCursor =
      hasNextPage && last
        ? encodeCursor<SimpleCursor>({
            sortValue: String(last.created_at),
            id: last.id,
          })
        : null;

    return { status: 200, data: page, nextCursor, hasNextPage };
  },
);
