"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import type { PaginatedResult, SimpleCursor } from "@/types/pagination";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@/utils/pagination";

// Public list of reviews for one event -- mirrors getPlaceReviews.ts exactly,
// including the same joined-row `any` (no generated Supabase types exist in
// this repo, see PROJECT.md).
export async function getEventReviews(
  eventId: string,
  options?: { cursor?: string | null; pageSize?: number },
  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md) -- matches getPlaceReviews.ts's convention for a joined review row
): Promise<PaginatedResult<any>> {
  const supabase = publicSupabase;
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  let query = supabase
    .from("event_review")
    .select(
      "*, user_info:reviewer_id(username, avatar_public_id, avatar_version), event_review_photo(id, public_id, version, position)",
    )
    .eq("event_id", eventId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    query = query.or(keysetOlderThan("created_at", "id", cursor));
  }

  const { data, error } = await query;

  if (error) {
    console.log(`Failed fetching event reviews: ${error.message}`);

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
