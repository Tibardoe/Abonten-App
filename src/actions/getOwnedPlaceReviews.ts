"use server";

import { createClient } from "@/config/supabase/server";
import type { PaginatedResult, SimpleCursor } from "@/types/pagination";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@/utils/pagination";

// Reviews of places this user owns/manages — the place-side counterpart to
// getUserReviews.ts (which shows reviews written ABOUT this user as an
// event organizer). place_review has no "reviewed person" column the way
// `review` has `reviewed_id` (a review is about a place, not a person), so
// this filters by joining to `place` and matching its owner_id instead —
// the `place:place_id!inner(...)` embed + `.eq("place.owner_id", ...)`
// pattern already used by getMyEventsTabCounts.ts/getUserTicketRefunds.ts.
export async function getOwnedPlaceReviews(
  username: string,
  options?: { cursor?: string | null; pageSize?: number },
  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md) -- matches getUserReviews.ts's convention for a joined review row
): Promise<PaginatedResult<any>> {
  const supabase = await createClient();
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  const { data: user, error: userError } = await supabase
    .from("user_info")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (!user || userError) {
    console.log(`Error fetching user id: ${userError?.message}`);

    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong!",
    };
  }

  let query = supabase
    .from("place_review")
    .select(
      "*, user_info:reviewer_id(username, avatar_public_id, avatar_version), place:place_id!inner(name, slug, owner_id)",
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
    console.log(`Failed fetching owned-place reviews: ${error.message}`);

    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong!",
    };
  }

  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
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
