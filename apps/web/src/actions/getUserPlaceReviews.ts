"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@/utils/pagination";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";

// The reviewer's own place_review history -- the "Places" side of the
// "Reviewed" tab on My Tickets, mirroring getUserEventReviews.ts exactly.
// Distinct from getOwnedPlaceReviews.ts, which lists reviews OF places this
// user owns, not reviews they themselves wrote.
export async function getUserPlaceReviews(
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
    .from("place_review")
    .select(
      "*, place:place_id(id, name, slug, cover_public_id, cover_version, owner_id), place_review_photo(id, public_id, version, position)",
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
    logger.error(`Failed fetching user's place reviews: ${error.message}`);
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
