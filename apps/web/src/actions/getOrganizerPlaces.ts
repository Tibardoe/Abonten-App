"use server";

import { createClient } from "@/config/supabase/server";
import { fetchOrganizerPlacesPage } from "@/utils/organizerReadQuery";
import { logger } from "@abonten/core/logger";
import type { PaginatedResult } from "@abonten/types/pagination";

export default async function getOrganizerPlaces(options?: {
  // Public profile lookup (e.g. /user/[username]/places): when set, returns
  // that user's places without requiring the viewer to be signed in, same
  // as getUserPosts(username, ...). When omitted, falls back to the
  // original behavior -- the currently authenticated caller's own places
  // (used by /manage/places, which is inherently "my places" and already
  // auth-gated by the page itself, plus the mobile
  // GET /api/mobile/organizer/places route).
  username?: string;
  cursor?: string | null;
  pageSize?: number;
  // biome-ignore lint/suspicious/noExplicitAny: the joined place_category shape doesn't match PlaceType's flat category_name/category_slug fields (that shape is specific to the get_nearby_places/get_filtered_places RPCs), and no generated Supabase types exist in this repo (see PROJECT.md)
}): Promise<PaginatedResult<any>> {
  const supabase = await createClient();

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

  return fetchOrganizerPlacesPage(supabase, ownerId, {
    cursor: options?.cursor,
    pageSize: options?.pageSize,
  });
}
