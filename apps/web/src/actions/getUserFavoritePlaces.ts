"use server";

import { createClient } from "@/config/supabase/server";
import type { PlaceOpeningHourRow } from "@abonten/core/computePlaceOpenStatus";
import { computePlaceOpenStatus } from "@abonten/core/computePlaceOpenStatus";
import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@abonten/core/pagination";
import type { FavoritePlaces } from "@abonten/types/favoritePlaceTypes";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";

// Raw join shape from Supabase (favorite_place -> place -> place_category /
// place_opening_hours). No generated Supabase types exist in this repo (see
// PROJECT.md), same reason getOrganizerPlaces.ts/getPlaceBySlug.ts use `any`
// for their raw joined rows.
// biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
type RawFavoritePlaceRow = any;

// Mirrors getUserFavoritePosts.ts's exact shape/cursor-pagination pattern,
// for favorite_place + place instead of favorite + event.
//
// PlaceCard (reused for rendering this list) needs PlaceType's full shape --
// including avg_rating/review_count/is_open -- but those are only computed
// inside the get_nearby_places/get_filtered_places RPCs (see PlaceType's own
// comment), not available from a plain favorite_place/place join. Rather
// than feed PlaceCard fabricated zero/false values (a false "Closed" badge,
// a false 0-star rating), this action computes them the same way
// getPlaceBySlug.ts and computePlaceOpenStatus already do elsewhere in this
// codebase: a batched place_review aggregate (mirrors
// getAttendace.ts's getEventAttendanceCounts batching) plus the joined
// place_opening_hours rows.
export async function getUserFavoritePlaces(options?: {
  cursor?: string | null;
  pageSize?: number;
}): Promise<PaginatedResult<FavoritePlaces>> {
  const supabase = await createClient();
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: `Failed fetching user: ${userError.message}`,
    };
  }

  if (!user) {
    return {
      status: 401,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "User not logged in",
    };
  }

  let query = supabase
    .from("favorite_place")
    .select(
      "*, place(*, place_category(name, slug), place_opening_hours(day_of_week, open_time, close_time, is_closed))",
    )
    .eq("user_id", user.user.id)
    .order("created_at", { ascending: false })
    .order("place_id", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    query = query.or(keysetOlderThan("created_at", "place_id", cursor));
  }

  const { data, error } = await query;

  if (error) {
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: `Failed fetching favorite places: ${error.message}`,
    };
  }

  const { page, hasNextPage } = splitPage<RawFavoritePlaceRow>(data, pageSize);

  const placeIds = page.map((favorite) => favorite.place.id);

  const ratingsByPlaceId =
    placeIds.length > 0
      ? await getPlaceRatingAggregates(supabase, placeIds)
      : {};

  const favoritesWithPlaceType: FavoritePlaces[] = page.map((favorite) => {
    const place = favorite.place;
    const openingHours: PlaceOpeningHourRow[] = place.place_opening_hours ?? [];
    const { isOpen } = computePlaceOpenStatus(
      openingHours,
      place.temporary_status,
    );
    const rating = ratingsByPlaceId[place.id];

    return {
      user_id: favorite.user_id,
      place_id: favorite.place_id,
      created_at: favorite.created_at,
      place: {
        id: place.id,
        owner_id: place.owner_id,
        name: place.name,
        slug: place.slug,
        description: place.description,
        category_id: place.category_id,
        category_name: place.place_category?.name ?? "Uncategorized",
        category_slug: place.place_category?.slug ?? "",
        location: place.location,
        address: place.address,
        website_url: place.website_url,
        phone: place.phone,
        whatsapp: place.whatsapp,
        cover_public_id: place.cover_public_id,
        cover_version: place.cover_version,
        status: place.status,
        temporary_status: place.temporary_status,
        claimed: place.claimed,
        verified: place.verified,
        created_at: place.created_at,
        avg_rating: rating?.avgRating ?? null,
        review_count: rating?.reviewCount ?? 0,
        is_open: isOpen,
        distance_km: null,
      },
    };
  });

  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.created_at),
          id: last.place_id,
        })
      : null;

  return {
    status: 200,
    data: favoritesWithPlaceType,
    nextCursor,
    hasNextPage,
  };
}

// Single batched query for the whole page's rating data, same reasoning as
// getEventAttendanceCounts (one round trip instead of one per place). Only
// 'approved' reviews count, matching getPlaceBySlug.ts.
async function getPlaceRatingAggregates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  placeIds: string[],
): Promise<Record<string, { avgRating: number; reviewCount: number }>> {
  const { data, error } = await supabase
    .from("place_review")
    .select("place_id, rating")
    .eq("status", "approved")
    .in("place_id", placeIds);

  if (error || !data) {
    logger.error(`Error fetching place rating aggregates: ${error?.message}`);
    return {};
  }

  const sums: Record<string, { sum: number; count: number }> = {};
  for (const row of data) {
    const entry = sums[row.place_id] ?? { sum: 0, count: 0 };
    entry.sum += row.rating;
    entry.count += 1;
    sums[row.place_id] = entry;
  }

  const result: Record<string, { avgRating: number; reviewCount: number }> = {};
  for (const [placeId, { sum, count }] of Object.entries(sums)) {
    result[placeId] = {
      avgRating: Number.parseFloat((sum / count).toFixed(1)),
      reviewCount: count,
    };
  }

  return result;
}
