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

export default async function getOrganizerPlaces(options?: {
  // Public profile lookup (e.g. /user/[username]/places): when set, returns
  // that user's places without requiring the viewer to be signed in, same
  // as getUserPosts(username, ...). When omitted, falls back to the
  // original behavior -- the currently authenticated caller's own places
  // (used by /manage/places, which is inherently "my places" and already
  // auth-gated by the page itself).
  username?: string;
  cursor?: string | null;
  pageSize?: number;
  // biome-ignore lint/suspicious/noExplicitAny: the joined place_category shape doesn't match PlaceType's flat category_name/category_slug fields (that shape is specific to the get_nearby_places/get_filtered_places RPCs), and no generated Supabase types exist in this repo (see PROJECT.md)
}): Promise<PaginatedResult<any>> {
  const supabase = await createClient();
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  let ownerId: string;

  if (options?.username) {
    const { data: profile, error: profileError } = await supabase
      .from("user_info")
      .select("id")
      .eq("username", options.username)
      .maybeSingle();

    if (profileError || !profile) {
      return {
        status: 404,
        data: [],
        nextCursor: null,
        hasNextPage: false,
        message: "User not found",
      };
    }

    ownerId = profile.id;
  } else {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      logger.error(userError?.message);
      return {
        status: 500,
        data: [],
        nextCursor: null,
        hasNextPage: false,
        message: "User not logged in",
      };
    }

    ownerId = user.id;
  }

  let query = supabase
    .from("place")
    .select("*, place_category(name, slug)")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    query = query.or(keysetOlderThan("created_at", "id", cursor));
  }

  const { data: places, error: placesError } = await query;

  if (placesError) {
    logger.error(`Error fetching organizer's places: ${placesError.message}`);

    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong!",
    };
  }

  // biome-ignore lint/suspicious/noExplicitAny: see the return-type biome-ignore above
  const { page, hasNextPage } = splitPage<any>(places, pageSize);

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
