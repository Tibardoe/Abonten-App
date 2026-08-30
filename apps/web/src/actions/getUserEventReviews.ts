"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@abonten/core/pagination";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";

// The reviewer's own event_review history -- the "Reviewed" tab on My
// Tickets, the counterpart to "To Review" (getEventsAwaitingReview.ts).
// Unlike that list, this can grow indefinitely over a user's lifetime, so
// it's cursor-paginated the same way every other review/ticket list in this
// app is (see getEventReviews.ts), not a flat fetch-everything query.
export async function getUserEventReviews(
  options?: { cursor?: string | null; pageSize?: number },
  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
): Promise<PaginatedResult<any>> {
  const supabase = await createClient();
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      status: 401,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "User not logged in",
    };
  }

  let query = supabase
    .from("event_review")
    .select(
      "*, event:event_id(id, title, event_code, flyer_public_id, flyer_version, organizer_id), event_review_photo(id, public_id, version, position)",
    )
    .eq("reviewer_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    query = query.or(keysetOlderThan("created_at", "id", cursor));
  }

  const { data, error } = await query;

  if (error) {
    logger.error(`Failed fetching user's event reviews: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong!",
    };
  }

  // biome-ignore lint/suspicious/noExplicitAny: see the return-type biome-ignore above
  const { page, hasNextPage } = splitPage<any>(data, pageSize);

  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.created_at),
          id: last.id,
        })
      : null;

  return { status: 200, data: page, nextCursor, hasNextPage };
}
